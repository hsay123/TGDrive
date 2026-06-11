import fs from 'fs'
import path from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'
import { v4 as uuidv4 } from 'uuid'

export const MAX_CHUNK_SIZE = 1.9 * 1024 * 1024 * 1024

export interface ChunkInfo {
  index: number
  path: string
  size: number
}

export function needsChunkingBySize(sizeBytes: number): boolean {
  return sizeBytes > MAX_CHUNK_SIZE
}

export function needsChunking(filePath: string): boolean {
  const stat = fs.statSync(filePath)
  return needsChunkingBySize(stat.size)
}

export async function splitFile(filePath: string): Promise<ChunkInfo[]> {
  try {
    const stat = fs.statSync(filePath)
    const fileSize = stat.size

    if (!needsChunkingBySize(fileSize)) {
      return [{ index: 0, path: filePath, size: fileSize }]
    }

    const tempDir = path.join(os.tmpdir(), `televault-chunks-${uuidv4()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    const chunks: ChunkInfo[] = []
    let offset = 0
    let index = 0

    while (offset < fileSize) {
      const chunkSize = Math.min(MAX_CHUNK_SIZE, fileSize - offset)
      const chunkPath = path.join(tempDir, `chunk-${index}`)
      const readStream = fs.createReadStream(filePath, {
        start: offset,
        end: offset + chunkSize - 1,
      })
      const writeStream = fs.createWriteStream(chunkPath)
      await pipeline(readStream, writeStream)

      chunks.push({ index, path: chunkPath, size: chunkSize })
      offset += chunkSize
      index++
    }

    return chunks
  } catch (error) {
    console.error('[chunker] splitFile error:', error)
    throw error
  }
}

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

export async function cleanupChunks(chunks: ChunkInfo[]): Promise<void> {
  try {
    const tempDirs = new Set<string>()

    for (const chunk of chunks) {
      const dir = path.dirname(chunk.path)
      const tempRoot = os.tmpdir()
      if (dir.startsWith(tempRoot) && dir.includes('televault-chunks-')) {
        tempDirs.add(dir)
      }
    }

    for (const dir of tempDirs) {
      await fs.promises.rm(dir, { recursive: true, force: true })
    }
  } catch (error) {
    console.error('[chunker] cleanupChunks error:', error)
    throw error
  }
}
