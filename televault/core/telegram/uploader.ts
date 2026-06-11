import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import mime from 'mime-types'
import sharp from 'sharp'
import { getClient, getSetting } from './client'
import { getChannelId, getChannelEntity, type ChannelPurpose } from './channels'
import { withRetry, withEntityRetry } from './ratelimit'
import { createFile, updateFileThumbnail } from '../db/files.db'
import { createChunk } from '../db/chunks.db'
import { getFolderByPath } from '../db/folders.db'
import type { File } from '../db/schema'
import {
  splitFile,
  cleanupChunks,
  needsChunking,
  type ChunkInfo,
} from '../fs/chunker'
import { encryptFile } from '../crypto/encrypt'
import { getEncryptionKey } from '../crypto/keystore'

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
  purpose: ChannelPurpose   // use purpose, not raw channelId
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
    // Resolve entity via stored accessHash — works after restart, no cold-cache errors
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
    if (!fileInput) {
      throw new Error('No file input available for upload')
    }

    const message = await withEntityRetry(() =>
      withRetry(() =>
        client.sendFile(entity, {
          file: fileInput,
          caption: options.caption,
          forceDocument: true,
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

async function prepareUploadPath(
  sourcePath: string,
  encrypted: boolean
): Promise<{ uploadPath: string; cleanup: () => Promise<void> }> {
  if (!encrypted) {
    return { uploadPath: sourcePath, cleanup: async () => {} }
  }

  const tempPath = path.join(os.tmpdir(), `televault-enc-${uuidv4()}`)
  const key = await getEncryptionKey()
  await encryptFile(sourcePath, tempPath, key)

  return {
    uploadPath: tempPath,
    cleanup: async () => {
      await fs.promises.unlink(tempPath).catch(() => {})
    },
  }
}

export async function uploadFile(
  localPath: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<File> {
  const tempEncryptedPaths: string[] = []
  let chunkInfos: ChunkInfo[] = []

  try {
    const { folderPath, fileName } = parseDestPath(destPath)
    const folder = getFolderByPath(folderPath)
    if (!folder) {
      throw new Error(`Destination folder not found: ${folderPath}`)
    }

    const stat = fs.statSync(localPath)
    const mimeType = mime.lookup(fileName) || 'application/octet-stream'
    const encrypted = isEncryptionEnabled()
    const channelId = await getChannelId('storage')  // raw ID for DB records
    const fileId = uuidv4()
    const now = Date.now()
    const isChunked = needsChunking(localPath) ? 1 : 0

    chunkInfos = await splitFile(localPath)
    const chunkTotal = chunkInfos.length
    let uploadedBytes = 0
    const totalBytes = stat.size

    const uploadChunk = async (
      chunk: ChunkInfo,
      chunkIndex: number
    ): Promise<UploadResult> => {
      const { uploadPath, cleanup } = await prepareUploadPath(
        chunk.path,
        encrypted
      )
      if (uploadPath !== chunk.path) {
        tempEncryptedPaths.push(uploadPath)
      }

      try {
        const caption = buildCaption({
          tv: true,
          fileId,
          path: destPath,
          name: fileName,
          mime: mimeType,
          size: stat.size,
          encrypted,
          chunkIndex,
          chunkTotal,
        })

        return await uploadToTelegram({
          filePath: uploadPath,
          fileName:
            chunkTotal > 1
              ? `${fileName}.part${chunkIndex}`
              : fileName,
          purpose: 'storage',   // resolved to InputPeerChannel via accessHash
          caption,
          onProgress: onProgress
            ? (_percent, uploaded) => {
                const overall =
                  totalBytes > 0
                    ? ((uploadedBytes + uploaded) / totalBytes) * 100
                    : 0
                onProgress(Math.min(100, overall))
              }
            : undefined,
        })
      } finally {
        await cleanup()
      }
    }

    const results: UploadResult[] = []
    for (const chunk of chunkInfos) {
      const result = await uploadChunk(chunk, chunk.index)
      results.push(result)
      uploadedBytes += chunk.size
      onProgress?.(
        totalBytes > 0 ? Math.min(100, (uploadedBytes / totalBytes) * 100) : 100
      )
    }

    const fileRecord = createFile({
      id: fileId,
      folder_id: folder.id,
      name: fileName,
      path: destPath.startsWith('/') ? destPath : `/${destPath}`,
      size: stat.size,
      mime_type: mimeType,
      is_encrypted: encrypted ? 1 : 0,
      is_chunked: isChunked,
      chunk_count: chunkTotal,
      uploaded_at: now,
      updated_at: now,
      thumbnail_path: null,
    })

    // Generate thumbnail for image files
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
        console.log(`[uploader] Thumbnail generated: ${thumbPath}`)
      } catch (thumbErr) {
        // Non-fatal: thumbnail failure should not break the upload
        console.warn('[uploader] Thumbnail generation failed:', thumbErr)
      }
    }

    for (let i = 0; i < results.length; i++) {
      createChunk({
        file_id: fileRecord.id,
        chunk_index: chunkInfos[i].index,
        message_id: results[i].messageId,
        channel_id: channelId,
        size: chunkInfos[i].size,
      })
    }

    onProgress?.(100)
    return fileRecord
  } catch (error) {
    console.error('[uploader] uploadFile error:', error)
    throw error
  } finally {
    for (const tempPath of tempEncryptedPaths) {
      await fs.promises.unlink(tempPath).catch(() => {})
    }
    if (chunkInfos.length > 1) {
      await cleanupChunks(chunkInfos)
    }
  }
}
