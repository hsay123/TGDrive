import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { pipeline } from 'stream/promises'
import { v4 as uuidv4 } from 'uuid'

// 512 MB — fast enough, small enough to retry quickly on failure
export const CHUNK_SIZE = 512 * 1024 * 1024

// Keep for backward-compat; same value
export const MAX_CHUNK_SIZE = CHUNK_SIZE

/** Lazy chunk descriptor — no disk writes until createTempFile() is called */
export interface ChunkStream {
  index: number
  start: number
  end: number    // inclusive
  size: number
  /**
   * Write this chunk to a temp file and return its path.
   * Caller is responsible for deleting the file after upload.
   */
  createTempFile: () => Promise<string>
}

/** Legacy shape used by downloader's assembleChunks */
export interface ChunkInfo {
  index: number
  path: string
  size: number
}

// ─── Upload-side: one temp chunk at a time ─────────────────────────────────

/**
 * Return descriptors for each 512 MB chunk of the file.
 * No data is read until createTempFile() is called, and only ONE chunk
 * is ever on disk at a time (caller writes → uploads → deletes before next).
 */
export function getChunks(filePath: string): ChunkStream[] {
  const fileSize = fs.statSync(filePath).size
  const tempBase = path.join(app.getPath('userData'), 'chunks-temp')

  if (fileSize <= CHUNK_SIZE) {
    // Single-chunk: no temp file needed — we return the original path
    return [{
      index: 0,
      start: 0,
      end: fileSize - 1,
      size: fileSize,
      createTempFile: async () => filePath,   // use original, no copy
    }]
  }

  const chunks: ChunkStream[] = []
  let index = 0
  let start = 0

  while (start < fileSize) {
    const end = Math.min(start + CHUNK_SIZE, fileSize) - 1
    const size = end - start + 1
    const s = start  // capture for closure

    chunks.push({
      index,
      start: s,
      end,
      size,
      createTempFile: async () => {
        await fs.promises.mkdir(tempBase, { recursive: true })
        const tmpPath = path.join(tempBase, `chunk-${uuidv4()}`)
        const read = fs.createReadStream(filePath, { start: s, end })
        const write = fs.createWriteStream(tmpPath)
        await pipeline(read, write)
        return tmpPath
      },
    })

    start += CHUNK_SIZE
    index++
  }

  return chunks
}

export function needsChunking(filePath: string): boolean {
  return fs.statSync(filePath).size > CHUNK_SIZE
}

export function needsChunkingBySize(sizeBytes: number): boolean {
  return sizeBytes > CHUNK_SIZE
}

// ─── Download-side: assemble downloaded chunk files into final file ─────────

export async function assembleChunks(
  chunks: ChunkInfo[],
  destPath: string
): Promise<void> {
  try {
    const sorted = [...chunks].sort((a, b) => a.index - b.index)
    const output = fs.createWriteStream(destPath)

    await new Promise<void>((resolve, reject) => {
      output.on('error', reject)

      const writeNext = (i: number): void => {
        if (i >= sorted.length) {
          output.end(resolve)
          return
        }

        const input = fs.createReadStream(sorted[i].path)
        input.on('error', reject)
        input.on('end', () => writeNext(i + 1))
        input.pipe(output, { end: false })
      }

      writeNext(0)
    })
  } catch (error) {
    console.error('[chunker] assembleChunks error:', error)
    throw error
  }
}
