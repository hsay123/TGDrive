import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import type { File } from './schema'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function createFile(data: Omit<File, 'id'> & { id?: string }): File {
  const db = getDb()
  const { id: providedId, ...rest } = data
  const file: File = {
    id: providedId ?? uuidv4(),
    ...rest,
  }

  db.prepare(
    `INSERT INTO files (
      id, folder_id, name, path, size, mime_type,
      is_encrypted, is_chunked, chunk_count,
      uploaded_at, updated_at, thumbnail_path, starred
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    file.id,
    file.folder_id,
    file.name,
    file.path,
    file.size,
    file.mime_type,
    file.is_encrypted,
    file.is_chunked,
    file.chunk_count,
    file.uploaded_at,
    file.updated_at,
    file.thumbnail_path,
    file.starred ?? 0
  )

  return file
}

export function getFileById(id: string): File | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id) as
    | File
    | undefined
}

export function getFileByPath(filePath: string): File | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM files WHERE path = ?').get(filePath) as
    | File
    | undefined
}

export function getAllFiles(): File[] {
  const db = getDb()
  return db.prepare('SELECT * FROM files').all() as File[]
}

export function getFilesByFolder(folderId: string): File[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM files WHERE folder_id = ? ORDER BY name ASC')
    .all(folderId) as File[]
}

export function updateFile(id: string, updates: Partial<File>): void {
  const db = getDb()
  const existing = getFileById(id)
  if (!existing) {
    throw new Error(`File not found: ${id}`)
  }

  const updated: File = {
    ...existing,
    ...updates,
    id: existing.id,
    updated_at: updates.updated_at ?? Date.now(),
  }

  db.prepare(
    `UPDATE files SET
      folder_id = ?, name = ?, path = ?, size = ?, mime_type = ?,
      is_encrypted = ?, is_chunked = ?, chunk_count = ?,
      uploaded_at = ?, updated_at = ?, thumbnail_path = ?
     WHERE id = ?`
  ).run(
    updated.folder_id,
    updated.name,
    updated.path,
    updated.size,
    updated.mime_type,
    updated.is_encrypted,
    updated.is_chunked,
    updated.chunk_count,
    updated.uploaded_at,
    updated.updated_at,
    updated.thumbnail_path,
    id
  )
}

export function updateFileThumbnail(id: string, thumbnailPath: string): void {
  getDb()
    .prepare('UPDATE files SET thumbnail_path = ? WHERE id = ?')
    .run(thumbnailPath, id)
}

export function deleteFile(id: string): void {
  const db = getDb()
  const result = db.prepare('DELETE FROM files WHERE id = ?').run(id)
  if (result.changes === 0) {
    throw new Error(`File not found: ${id}`)
  }
}

export function moveFile(
  id: string,
  newFolderId: string,
  newPath: string
): void {
  const existing = getFileById(id)
  if (!existing) {
    throw new Error(`File not found: ${id}`)
  }

  updateFile(id, {
    folder_id: newFolderId,
    path: newPath,
    updated_at: Date.now(),
  })
}

export function searchFiles(query: string): File[] {
  const db = getDb()
  const pattern = `%${query}%`
  return db
    .prepare(
      `SELECT * FROM files
       WHERE name LIKE ? COLLATE NOCASE OR path LIKE ? COLLATE NOCASE
       ORDER BY uploaded_at DESC`
    )
    .all(pattern, pattern) as File[]
}

export function getRecentFiles(limit = 20): File[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM files ORDER BY uploaded_at DESC LIMIT ?')
    .all(limit) as File[]
}

export function getTotalStorageUsed(): number {
  const db = getDb()
  const row = db
    .prepare('SELECT COALESCE(SUM(size), 0) AS total FROM files')
    .get() as { total: number }
  return row.total
}

export function softDeleteFile(id: string): void {
  const db = getDb()
  const file = getFileById(id)
  if (!file) {
    throw new Error(`File not found: ${id}`)
  }

  const now = Date.now()
  const trashId = uuidv4()

  const insertTrash = db.prepare(
    `INSERT INTO trash (id, original_path, file_id, folder_id, file_data, deleted_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )

  const removeFile = db.prepare('DELETE FROM files WHERE id = ?')

  const transaction = db.transaction(() => {
    insertTrash.run(
      trashId,
      file.path,
      file.id,
      file.folder_id,
      JSON.stringify(file),
      now,
      now + THIRTY_DAYS_MS
    )
    removeFile.run(id)
  })

  transaction()
}

export function toggleStar(id: string): boolean {
  const db = getDb()
  const file = getFileById(id)
  if (!file) throw new Error(`File not found: ${id}`)
  const newStarred = file.starred ? 0 : 1
  db.prepare('UPDATE files SET starred = ? WHERE id = ?').run(newStarred, id)
  return newStarred === 1
}

export function getStarredFiles(): File[] {
  return getDb()
    .prepare('SELECT * FROM files WHERE starred = 1 ORDER BY updated_at DESC')
    .all() as File[]
}

/**
 * Rename a file. Checks for name collision within the same folder path.
 */
export function renameFile(id: string, newName: string): void {
  const db = getDb()
  const file = getFileById(id)
  if (!file) throw new Error(`File not found: ${id}`)

  // Compute new path: same directory segment, new filename
  const dir = file.path.substring(0, file.path.lastIndexOf('/'))
  const newPath = `${dir}/${newName}`

  // Collision check — another file at the same path
  const existing = db
    .prepare('SELECT id FROM files WHERE path = ? AND id != ?')
    .get(newPath, id)
  if (existing) throw new Error(`A file named "${newName}" already exists here`)

  db.prepare(
    'UPDATE files SET name = ?, path = ?, updated_at = ? WHERE id = ?'
  ).run(newName, newPath, Date.now(), id)
}
