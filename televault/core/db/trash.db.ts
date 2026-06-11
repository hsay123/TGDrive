import { getDb } from './db'
import type { File, TrashEntry } from './schema'
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
