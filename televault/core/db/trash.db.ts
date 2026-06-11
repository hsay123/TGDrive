import { getDb } from './db'
import type { Chunk, File, TrashEntry } from './schema'
import { createFile, softDeleteFile } from './files.db'

export interface TrashRow {
  id: string
  originalPath: string
  fileId: string | null
  folderId: string | null
  deletedAt: number
  expiresAt: number
  name: string
  size: number
}

function toTrashRow(entry: TrashEntry): TrashRow {
  let name = entry.original_path.split('/').pop() ?? 'Unknown'
  let size = 0

  if (entry.file_data) {
    try {
      const parsed = JSON.parse(entry.file_data) as File
      name = parsed.name
      size = parsed.size
    } catch {
      // use defaults
    }
  }

  return {
    id: entry.id,
    originalPath: entry.original_path,
    fileId: entry.file_id,
    folderId: entry.folder_id,
    deletedAt: entry.deleted_at,
    expiresAt: entry.expires_at,
    name,
    size,
  }
}

export function getTrashedFiles(): TrashRow[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM trash ORDER BY deleted_at DESC')
    .all() as TrashEntry[]
  return rows.map(toTrashRow)
}

export function getTrashEntryById(id: string): TrashEntry | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM trash WHERE id = ?').get(id) as
    | TrashEntry
    | undefined
}

export function restoreFromTrash(trashId: string): void {
  const db = getDb()
  const entry = getTrashEntryById(trashId)
  if (!entry) {
    throw new Error(`Trash entry not found: ${trashId}`)
  }

  if (!entry.file_data) {
    throw new Error('Cannot restore: no file data in trash entry')
  }

  const fileData = JSON.parse(entry.file_data) as File

  const transaction = db.transaction(() => {
    createFile({
      id: fileData.id,
      folder_id: fileData.folder_id,
      name: fileData.name,
      path: fileData.path,
      size: fileData.size,
      mime_type: fileData.mime_type,
      is_encrypted: fileData.is_encrypted,
      is_chunked: fileData.is_chunked,
      chunk_count: fileData.chunk_count,
      uploaded_at: fileData.uploaded_at,
      updated_at: Date.now(),
      thumbnail_path: fileData.thumbnail_path,
    })
    db.prepare('DELETE FROM trash WHERE id = ?').run(trashId)
  })

  transaction()
}

export function deleteTrashEntry(id: string): void {
  const db = getDb()
  const result = db.prepare('DELETE FROM trash WHERE id = ?').run(id)
  if (result.changes === 0) {
    throw new Error(`Trash entry not found: ${id}`)
  }
}

export function trashFolderContents(folderId: string): void {
  const db = getDb()
  const files = db
    .prepare('SELECT id FROM files WHERE folder_id = ?')
    .all(folderId) as Array<{ id: string }>

  for (const file of files) {
    softDeleteFile(file.id)
  }
}

/**
 * Permanently delete a trash entry and all related DB records (chunks, versions).
 * Returns the chunks so the caller can delete the underlying Telegram messages.
 *
 * Looks up by trash.id first, falls back to trash.file_id for robustness
 * (in case the frontend passes the original file ID instead of the trash row ID).
 */
export function permanentlyDeleteTrashEntry(trashId: string): {
  fileId: string
  chunks: Chunk[]
} {
  const db = getDb()

  // Look up by trash entry ID (the row's own `id`)
  let trashEntry = db
    .prepare('SELECT * FROM trash WHERE id = ?')
    .get(trashId) as TrashEntry | undefined

  // Fallback: try matching by the original file_id
  if (!trashEntry) {
    trashEntry = db
      .prepare('SELECT * FROM trash WHERE file_id = ?')
      .get(trashId) as TrashEntry | undefined
  }

  if (!trashEntry) {
    throw new Error(`Trash entry not found: ${trashId}`)
  }

  if (!trashEntry.file_id) {
    // Folder trash entry — just remove the trash row
    db.prepare('DELETE FROM trash WHERE id = ?').run(trashEntry.id)
    return { fileId: '', chunks: [] }
  }

  // Get chunks BEFORE deleting (need message_id + channel_id to delete from Telegram)
  const chunks = db
    .prepare('SELECT * FROM chunks WHERE file_id = ?')
    .all(trashEntry.file_id) as Chunk[]

  // Clean up all related DB records atomically
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM chunks WHERE file_id = ?').run(trashEntry.file_id)
    db.prepare('DELETE FROM versions WHERE file_id = ?').run(trashEntry.file_id)
    db.prepare('DELETE FROM trash WHERE id = ?').run(trashEntry.id)
    // No need to DELETE FROM files — it was already removed by softDeleteFile()
  })
  transaction()

  return { fileId: trashEntry.file_id, chunks }
}
