import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getClient, getEntityCacheSize } from './client'
import { getChannelEntity, type ChannelPurpose } from './channels'
import { withRetry, withEntityRetry } from './ratelimit'
import { getFileById } from '../db/files.db'
import { getChunksByFileId } from '../db/chunks.db'
import { getSetting } from './client'
import { assembleChunks, type ChunkInfo } from '../fs/chunker'
import { decryptFile } from '../crypto/decrypt'
import { getEncryptionKey } from '../crypto/keystore'

export interface DownloadOptions {
  messageId: number
  channelId: string  // raw numeric string from DB (used to resolve purpose)
  destPath: string
  onProgress?: (percent: number, downloaded: number, total: number) => void
}

const MAX_CONCURRENT_DOWNLOADS = 3

/**
 * Resolve a raw channel ID string (from chunks DB) back to its ChannelPurpose
 * so we can call getChannelEntity(purpose) with the stored accessHash.
 */
function purposeFromChannelId(channelId: string): ChannelPurpose {
  const purposes: ChannelPurpose[] = ['storage', 'index', 'trash']
  for (const p of purposes) {
    const stored = getSetting(`${p}_channel_id`)
    if (stored === channelId) return p
  }
  // Fallback — storage is the only purpose used for file chunks
  console.warn(
    `[downloader] Could not map channelId ${channelId} to a ChannelPurpose; defaulting to 'storage'`
  )
  return 'storage'
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex++
      results[current] = await fn(items[current], current)
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results
}

export async function downloadFromTelegram(
  options: DownloadOptions
): Promise<void> {
  try {
    const client = getClient()

    // Resolve entity via accessHash (reliable after restart, no cold-cache errors)
    const purpose = purposeFromChannelId(options.channelId)
    const entity = await getChannelEntity(purpose)

    console.log(
      '[downloader] About to getMessages, entity:',
      JSON.stringify(entity)
    )
    console.log('[downloader] client._entityCache size:', getEntityCacheSize(client))

    const messages = await withEntityRetry(() =>
      withRetry(() => client.getMessages(entity, { ids: options.messageId }))
    )

    const message = messages[0]
    if (!message) {
      throw new Error(
        `Message ${options.messageId} not found in channel ${options.channelId}`
      )
    }

    await withEntityRetry(() =>
      withRetry(() =>
        client.downloadMedia(message, {
          outputFile: options.destPath,
          // @ts-ignore — gramjs accepts these but types may not expose them
          partSizeKb: 512,  // 8× default (64 KB) — fewer round trips
          workers: 4,       // parallel download workers
          progressCallback: options.onProgress
            ? (downloaded, total) => {
                const downloadedNum = Number(downloaded.toString())
                const totalNum = Number(total.toString())
                const percent =
                  totalNum > 0 ? (downloadedNum / totalNum) * 100 : 0
                options.onProgress?.(percent, downloadedNum, totalNum)
              }
            : undefined,
        })
      )
    )
  } catch (error) {
    console.error('[downloader] downloadFromTelegram error:', error)
    throw error
  }
}

export async function downloadFile(
  fileId: string,
  destPath: string,
  onProgress?: (percent: number, downloaded: number, total: number) => void
): Promise<void> {
  const tempPaths: string[] = []
  let chunkInfos: ChunkInfo[] = []

  try {
    const file = getFileById(fileId)
    if (!file) {
      throw new Error(`File not found: ${fileId}`)
    }

    const chunks = getChunksByFileId(fileId)
    if (chunks.length === 0) {
      throw new Error(`No chunks found for file: ${fileId}`)
    }

    // Use userData so download temp files never land in /tmp (avoids ENOSPC on small /tmp)
    const dlCacheDir = path.join(app.getPath('userData'), 'download-cache')
    const tempDir = path.join(dlCacheDir, `televault-dl-${uuidv4()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    let downloadedBytes = 0
    const totalBytes = chunks.reduce((sum, c) => sum + c.size, 0)

    const downloadedPaths = await runWithConcurrency(
      chunks,
      MAX_CONCURRENT_DOWNLOADS,
      async (chunk) => {
        const chunkPath = path.join(tempDir, `chunk-${chunk.chunk_index}`)
        tempPaths.push(chunkPath)

        await downloadFromTelegram({
          messageId: chunk.message_id,
          channelId: chunk.channel_id,
          destPath: chunkPath,
          onProgress: onProgress
            ? (_percent, downloaded) => {
                const overall =
                  totalBytes > 0
                    ? ((downloadedBytes + downloaded) / totalBytes) * 100
                    : 0
                onProgress(Math.min(99, overall), downloadedBytes + downloaded, totalBytes)
              }
            : undefined,
        })

        downloadedBytes += chunk.size
        onProgress?.(
          totalBytes > 0
            ? Math.min(99, (downloadedBytes / totalBytes) * 100)
            : 99,
          downloadedBytes,
          totalBytes
        )

        return chunkPath
      }
    )

    chunkInfos = chunks.map((chunk, i) => ({
      index: chunk.chunk_index,
      path: downloadedPaths[i],
      size: chunk.size,
    }))

    const assembledPath = path.join(tempDir, 'assembled')
    tempPaths.push(assembledPath)

    if (file.is_chunked === 1 || chunks.length > 1) {
      await assembleChunks(chunkInfos, assembledPath)
    } else {
      await fs.promises.copyFile(downloadedPaths[0], assembledPath)
    }

    let finalPath = assembledPath

    if (file.is_encrypted === 1) {
      const decryptedPath = path.join(tempDir, 'decrypted')
      tempPaths.push(decryptedPath)
      const key = await getEncryptionKey()
      await decryptFile(assembledPath, decryptedPath, key)
      finalPath = decryptedPath
    }

    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    await fs.promises.copyFile(finalPath, destPath)

    onProgress?.(100, totalBytes, totalBytes)
  } catch (error) {
    console.error('[downloader] downloadFile error:', error)
    throw error
  } finally {
    for (const tempPath of tempPaths) {
      await fs.promises.unlink(tempPath).catch(() => {})
    }
    // Clean up temp dir if empty
    if (chunkInfos.length > 0) {
      const tempDir = path.dirname(chunkInfos[0].path)
      fs.promises.rmdir(tempDir).catch(() => {})
    }
  }
}

/**
 * Downloads ONLY the first chunk (index 0) of a file to a preview-cache path.
 * Much faster than a full download — enough data for a video frame extraction.
 * Returns the local path of the partial file.
 */
export async function downloadFirstChunkToTemp(fileId: string): Promise<string> {
  const file = getFileById(fileId)
  if (!file) throw new Error(`File not found: ${fileId}`)

  const chunks = getChunksByFileId(fileId)
  if (chunks.length === 0) throw new Error(`No chunks for file: ${fileId}`)

  // Sort by chunk_index to ensure we always get the first real chunk
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index)
  const firstChunk = sorted[0]

  const cacheDir = path.join(app.getPath('userData'), 'preview-cache')
  await fs.promises.mkdir(cacheDir, { recursive: true })

  const ext = path.extname(file.name)
  // Use a separate suffix so it doesn't collide with the full-download cache entry
  const cachedPath = path.join(cacheDir, `${fileId}-partial${ext}`)

  // Return existing partial if already cached
  try {
    await fs.promises.access(cachedPath)
    return cachedPath
  } catch {
    // Not cached yet — download chunk 0
  }

  const tempPath = cachedPath + '.tmp'
  await downloadFromTelegram({
    messageId: firstChunk.message_id,
    channelId: firstChunk.channel_id,
    destPath: tempPath,
  })

  // Rename atomically so a concurrent call doesn't see a half-written file
  await fs.promises.rename(tempPath, cachedPath)
  return cachedPath
}
