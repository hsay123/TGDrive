import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import type { Chunk } from './schema'

export function createChunk(data: Omit<Chunk, 'id'>): Chunk {
  const db = getDb()
  const chunk: Chunk = {
    id: uuidv4(),
    ...data,
  }

  db.prepare(
    `INSERT INTO chunks (id, file_id, chunk_index, message_id, channel_id, size)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    chunk.id,
    chunk.file_id,
    chunk.chunk_index,
    chunk.message_id,
    chunk.channel_id,
    chunk.size
  )

  return chunk
}

export function getChunksByFileId(fileId: string): Chunk[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC'
    )
    .all(fileId) as Chunk[]
}

export function deleteChunksByFileId(fileId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM chunks WHERE file_id = ?').run(fileId)
}

export function getChunk(
  fileId: string,
  chunkIndex: number
): Chunk | undefined {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM chunks WHERE file_id = ? AND chunk_index = ?'
    )
    .get(fileId, chunkIndex) as Chunk | undefined
}
