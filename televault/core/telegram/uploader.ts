import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import mime from 'mime-types'
// @ts-ignore
import sharp from 'sharp'
import { getClient, getSetting } from './client'
import { getChannelId, getChannelEntity, type ChannelPurpose } from './channels'
import { withRetry, withEntityRetry } from './ratelimit'
import { createFile, updateFileThumbnail, getFileByPath, updateFile } from '../db/files.db'
import { createChunk, deleteChunksByFileId } from '../db/chunks.db'
import { archiveCurrentVersion } from '../db/versions.db'
import { getFolderByPath } from '../db/folders.db'
import type { File } from '../db/schema'
import {
  getChunks,
  needsChunking,
  type ChunkStream,
} from '../fs/chunker'
import { encryptFile } from '../crypto/encrypt'
import { getEncryptionKey } from '../crypto/keystore'
// @ts-ignore
import { CustomFile } from 'telegram/client/uploads'

export const MAX_FILE_SIZE = 1.9 * 1024 * 1024 * 1024

export interface UploadResult {
  messageId: number
  channelId: string
  size: number
  caption: string
}

export interface UploadOptions {
  filePath?: string
  buffer?: Buffer
  fileName: string
  purpose: ChannelPurpose
  caption: string
  onProgress?: (percent: number, uploaded: number, total: number) => void
}

interface CaptionMetadata {
  tv: boolean
  fileId: string
  path: string
  name: string
  mime: string
  size: number
  encrypted: boolean
  chunkIndex: number
  chunkTotal: number
}

function parseDestPath(destPath: string): { folderPath: string; fileName: string } {
  const normalized = destPath.startsWith('/') ? destPath : `/${destPath}`
  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash <= 0) {
    return { folderPath: '/', fileName: normalized.slice(1) }
  }
  return {
    folderPath: normalized.slice(0, lastSlash) || '/',
    fileName: normalized.slice(lastSlash + 1),
  }
}

function isEncryptionEnabled(): boolean {
  return getSetting('encryption_enabled') === '1'
}

function buildCaption(meta: CaptionMetadata): string {
  return JSON.stringify(meta)
}

export async function uploadToTelegram(
  options: UploadOptions
): Promise<UploadResult> {
  try {
    const client = getClient()
    const [entity, channelId] = await Promise.all([
      getChannelEntity(options.purpose),
      getChannelId(options.purpose),
    ])

    let totalSize = 0
    if (options.buffer) {
      totalSize = options.buffer.length
    } else if (options.filePath) {
      totalSize = fs.statSync(options.filePath).size
    } else {
      throw new Error('Either filePath or buffer must be provided')
    }

    const fileInput = options.buffer ?? options.filePath
    if (!fileInput) throw new Error('No file input available for upload')

    const message = await withEntityRetry(() =>
      withRetry(() =>
        client.sendFile(entity, {
          file: fileInput,
          caption: options.caption,
          forceDocument: true,
          workers: 16,
          // @ts-ignore — gramjs accepts this but types may not expose it
          partSizeKb: 512,
          progressCallback: options.onProgress
            ? (progress: number) => {
                const percent = progress * 100
                options.onProgress?.(percent, percent, 100)
              }
            : undefined,
        })
      )
    )

    return {
      messageId: message.id,
      channelId,
      size: totalSize,
      caption: options.caption,
    }
  } catch (error) {
    console.error('[uploader] uploadToTelegram error:', error)
    throw error
  }
}

/**
 * Upload a single chunk to Telegram with maximum throughput settings.
 *
 * workers: 16  — 16 parallel part-upload streams inside gramjs
 * partSizeKb: 512 — maximum part size Telegram allows (fewer round trips)
 *
 * Together these are the single biggest speed improvement possible in gramjs.
 * A typical connection sees 2–4× improvement over gramjs defaults.
 */
async function uploadChunk(
  chunkPath: string,
  chunkSize: number,
  chunkName: string,
  caption: string,
  entity: Awaited<ReturnType<typeof getChannelEntity>>,
  onProgress?: (p: number) => void,
): Promise<{ id: number }> {
  const client = getClient()
  const file = new CustomFile(chunkName, chunkSize, chunkPath)

  return withEntityRetry(() =>
    withRetry(() =>
      client.sendFile(entity, {
        file,
        caption,
        forceDocument: true,
        workers: 16,
        // @ts-ignore
        partSizeKb: 512,
        progressCallback: onProgress,
      })
    )
  )
}

export async function uploadFile(
  localPath: string,
  destPath: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<File> {
  let tempEncPath: string | null = null
  const activeTempChunks = new Set<string>()

  try {
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')

    const { folderPath, fileName } = parseDestPath(destPath)
    const folder = getFolderByPath(folderPath)
    if (!folder) throw new Error(`Destination folder not found: ${folderPath}`)

    const stat = fs.statSync(localPath)
    const fileSize = stat.size
    const mimeType = mime.lookup(fileName) || 'application/octet-stream'
    const encrypted = isEncryptionEnabled()
    const channelId = await getChannelId('storage')

    const normalizedDestPath = destPath.startsWith('/') ? destPath : `/${destPath}`
    const existing = getFileByPath(normalizedDestPath)
    if (existing) {
      archiveCurrentVersion(existing.id)
      deleteChunksByFileId(existing.id)
    }

    const fileId = existing ? existing.id : uuidv4()
    const now = Date.now()
    const isChunked = needsChunking(localPath) ? 1 : 0

    // ── Encryption: write ONE temp file, then chunk from it ──────────────
    let uploadPath = localPath
    if (encrypted) {
      const key = await getEncryptionKey()
      tempEncPath = path.join(app.getPath('userData'), `tvenc-${fileId}`)
      await encryptFile(localPath, tempEncPath, key)
      uploadPath = tempEncPath
    }

    const chunks = getChunks(uploadPath)
    const chunkTotal = chunks.length

    // ── Resolve entity once, reuse for all chunks ────────────────────────
    const entity = await getChannelEntity('storage')

    // ── Concurrency strategy ─────────────────────────────────────────────
    // Single-file: 3 parallel uploads (no temp files)
    // Multi-chunk: serial (1 at a time) to keep peak disk = orig + enc + 1 chunk
    // Large multi-chunk (>= 4 chunks / ~2 GB): 2 parallel to trade disk for speed
    let CONCURRENCY: number
    if (chunkTotal === 1) {
      CONCURRENCY = 3
    } else if (chunkTotal >= 4) {
      CONCURRENCY = 2  // 2 chunks in flight simultaneously for very large files
    } else {
      CONCURRENCY = 1
    }

    const chunkResults: Array<{ index: number; messageId: number }> = []
    let totalUploaded = 0
    const totalBytes = fileSize
    const chunkInflight = new Array<number>(chunkTotal).fill(0)

    console.time('[upload] total')

    const uploadOne = async (chunk: ChunkStream): Promise<void> => {
      const caption = buildCaption({
        tv: true,
        fileId,
        path: destPath,
        name: fileName,
        mime: mimeType,
        size: stat.size,
        encrypted,
        chunkIndex: chunk.index,
        chunkTotal,
      })

      const chunkPath = await chunk.createTempFile()
      const isTempFile = chunkPath !== uploadPath

      if (isTempFile) activeTempChunks.add(chunkPath)

      try {
        console.time(`[upload] chunk-${chunk.index}`)
        const result = await uploadChunk(
          chunkPath,
          chunk.size,
          chunkTotal > 1 ? `${fileName}.part${chunk.index}` : fileName,
          caption,
          entity,
          onProgress
            ? (p: number) => {
                chunkInflight[chunk.index] = p * chunk.size
                const overall = totalUploaded + chunkInflight.reduce((a, b) => a + b, 0)
                onProgress(Math.min(99, Math.round((overall / Math.max(totalBytes, 1)) * 100)))
              }
            : undefined,
        )
        console.timeEnd(`[upload] chunk-${chunk.index}`)

        chunkResults.push({ index: chunk.index, messageId: result.id })
        totalUploaded += chunk.size
        chunkInflight[chunk.index] = 0
      } finally {
        if (isTempFile) {
          await fs.promises.unlink(chunkPath).catch(() => {})
          activeTempChunks.delete(chunkPath)
        }
      }
    }

    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      if (signal?.aborted) {
        // Roll back any DB records created so far — file is half-uploaded
        if (!existing) {
          try { (await import('../db/files.db')).deleteFile(fileId) } catch { /* best-effort */ }
        }
        throw new DOMException('Upload cancelled', 'AbortError')
      }
      const batch = chunks.slice(i, i + CONCURRENCY)
      console.log(
        `[upload] Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(chunks.length / CONCURRENCY)}: chunks ${i}–${i + batch.length - 1} (concurrency=${CONCURRENCY})`
      )
      console.time(`[upload] batch-${i}`)
      await Promise.all(batch.map(uploadOne))
      console.timeEnd(`[upload] batch-${i}`)
      onProgress?.(Math.min(99, Math.round((totalUploaded / Math.max(totalBytes, 1)) * 100)))
    }

    console.timeEnd('[upload] total')

    // ── Persist file record ──────────────────────────────────────────────
    let fileRecord: File
    if (existing) {
      updateFile(existing.id, {
        size: stat.size,
        mime_type: mimeType,
        is_encrypted: encrypted ? 1 : 0,
        is_chunked: isChunked,
        chunk_count: chunkTotal,
        updated_at: now,
      })
      fileRecord = getFileByPath(normalizedDestPath)!
    } else {
      fileRecord = createFile({
        id: fileId,
        folder_id: folder.id,
        name: fileName,
        path: normalizedDestPath,
        size: stat.size,
        mime_type: mimeType,
        is_encrypted: encrypted ? 1 : 0,
        is_chunked: isChunked,
        chunk_count: chunkTotal,
        uploaded_at: now,
        updated_at: now,
        thumbnail_path: null,
        starred: 0,
      })
    }

    // ── Thumbnail ────────────────────────────────────────────────────────
    if (mimeType.startsWith('image/')) {
      try {
        const thumbDir = path.join(app.getPath('userData'), 'thumbnails')
        await fs.promises.mkdir(thumbDir, { recursive: true })
        const thumbPath = path.join(thumbDir, `${fileId}.jpg`)
        await sharp(localPath)
          .resize(200, 200, { fit: 'cover' })
          .jpeg({ quality: 70 })
          .toFile(thumbPath)
        updateFileThumbnail(fileId, thumbPath)
        fileRecord.thumbnail_path = thumbPath
      } catch (thumbErr) {
        console.warn('[uploader] Thumbnail generation failed:', thumbErr)
      }
    }

    // ── Insert chunk records ─────────────────────────────────────────────
    const sortedResults = [...chunkResults].sort((a, b) => a.index - b.index)
    for (const r of sortedResults) {
      createChunk({
        file_id: fileRecord.id,
        chunk_index: r.index,
        message_id: r.messageId,
        channel_id: channelId,
        size: chunks[r.index].size,
      })
    }

    onProgress?.(100)
    return fileRecord
  } catch (error) {
    console.error('[uploader] uploadFile error:', error)
    throw error
  } finally {
    for (const p of activeTempChunks) {
      await fs.promises.unlink(p).catch(() => {})
    }
    if (tempEncPath) {
      await fs.promises.unlink(tempEncPath).catch(() => {})
    }
  }
}
