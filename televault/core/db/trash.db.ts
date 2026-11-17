import { getDb } from './db'
import type { Chunk, File, TrashEntry } from './schema'
import { createFile, softDeleteFile } from './files.db'
import { getChunksByFileId } from './chunks.db'
import { createFolder, getFolderById, getFolderByPath } from './folders.db'

export interface TrashRow {
  id: string
  originalPath: string
  fileId: string | null
  folderId: string | null
  deletedAt: number
  expiresAt: number
  name: string
  size: number
  mimeType: string | null
  thumbnailPath: string | null
}

function toTrashRow(entry: TrashEntry): TrashRow {
  let name = entry.original_path.split('/').pop() ?? 'Unknown'
  let size = 0
  let mimeType: string | null = null
  let thumbnailPath: string | null = null

  if (entry.file_data) {
    try {
      const parsed = JSON.parse(entry.file_data) as File
      name = parsed.name
      size = parsed.size
      mimeType = parsed.mime_type ?? null
      thumbnailPath = parsed.thumbnail_path ?? null
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
    mimeType,
    thumbnailPath,
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

  const fileData = JSON.parse(entry.file_data) as File & { _chunks?: Chunk[] }

  // The original folder row may no longer exist (folder delete removes the
  // folder rows once every file in the subtree has been trashed). Recreate the
  // parent folder chain from the snapshot path so the file restores in place.
  let folderId = fileData.folder_id
  if (!folderId || !getFolderById(folderId)) {
    const lastSlash = fileData.path.lastIndexOf('/')
    const parentPath = lastSlash > 0 ? fileData.path.substring(0, lastSlash) : '/'
    folderId = ensureFolderPath(parentPath)
  }

  const transaction = db.transaction(() => {
    createFile({
      id: fileData.id,
      folder_id: folderId,
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
      starred: 0,
      is_hidden: fileData.is_hidden ?? 0,
    })

    // Re-attach the chunk records (Telegram message/channel ids) so the restored
    // file can actually be downloaded again — the original rows were cascade
    // deleted when the file row was removed by softDeleteFile().
    if (fileData._chunks && fileData._chunks.length > 0) {
      const insertChunk = db.prepare(
        `INSERT INTO chunks (id, file_id, chunk_index, message_id, channel_id, size)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const chunk of fileData._chunks) {
        insertChunk.run(
          chunk.id,
          fileData.id,
          chunk.chunk_index,
          chunk.message_id,
          chunk.channel_id,
          chunk.size
        )
      }
    }

    db.prepare('DELETE FROM trash WHERE id = ?').run(trashId)
  })

  transaction()
}

/**
 * Ensure a folder path exists (creating any missing segments), and return the
 * id of the deepest folder. Used by restoreFromTrash when the folder a file
 * was trashed from no longer exists.
 */
function ensureFolderPath(folderPath: string): string {
  const segments = folderPath.split('/').filter(Boolean)

  let currentPath = '/'
  let currentId = getFolderByPath('/')?.id ?? null
  if (!currentId) {
    const root = createFolder('Root', null, '/')
    currentId = root.id
  }

  for (const segment of segments) {
    currentPath = currentPath === '/' ? `/${segment}` : `${currentPath}/${segment}`
    const existing = getFolderByPath(currentPath)
    if (existing) {
      currentId = existing.id
    } else {
      const created = createFolder(segment, currentId, currentPath)
      currentId = created.id
    }
  }

  return currentId as string
}

export function deleteTrashEntry(id: string): void {
  const db = getDb()
  const result = db.prepare('DELETE FROM trash WHERE id = ?').run(id)
  if (result.changes === 0) {
    throw new Error(`Trash entry not found: ${id}`)
  }
}

/**
 * Soft-delete every file in the given folder AND its entire subtree of
 * descendant folders. Each file (and its chunk records) is snapshotted into
 * the trash table before its row is removed, so the subsequent cascade delete
 * of the folder rows can never destroy data that was not first captured.
 *
 * Throws if any live file remains under the subtree after trashing — that
 * would mean the folder delete below would cascade-hard-delete uncaptured
 * data, which must never be allowed.
 */
export function trashFolderContents(folderId: string): void {
  const db = getDb()

  // Collect the full subtree of folder ids (target folder + all descendants).
  const folderIds: string[] = []
  const queue: string[] = [folderId]
  while (queue.length > 0) {
    const current = queue.shift() as string
    folderIds.push(current)
    const children = db
      .prepare('SELECT id FROM folders WHERE parent_id = ?')
      .all(current) as Array<{ id: string }>
    for (const child of children) queue.push(child.id)
  }

  const transaction = db.transaction(() => {
    for (const id of folderIds) {
      const files = db
        .prepare('SELECT id FROM files WHERE folder_id = ?')
        .all(id) as Array<{ id: string }>
      for (const file of files) {
        softDeleteFile(file.id)
      }
    }

    // Invariant: no live file may remain under the subtree.
    let remaining = 0
    for (const id of folderIds) {
      const row = db
        .prepare('SELECT COUNT(*) AS n FROM files WHERE folder_id = ?')
        .get(id) as { n: number }
      remaining += row.n
    }
    if (remaining > 0) {
      throw new Error(
        `Aborting folder delete: ${remaining} file(s) could not be captured in trash`
      )
    }
  })

  transaction()
}

/**
 * Resolve a trash entry by its trash row id, with a fallback to the original
 * file_id (in case the caller passes a file id instead of the trash row id).
 * Throws if nothing matches.
 */
export function resolveTrashEntry(trashId: string): TrashEntry {
  const db = getDb()
  const byId = db
    .prepare('SELECT * FROM trash WHERE id = ?')
    .get(trashId) as TrashEntry | undefined
  if (byId) return byId

  const byFileId = db
    .prepare('SELECT * FROM trash WHERE file_id = ?')
    .get(trashId) as TrashEntry | undefined
  if (byFileId) return byFileId

  throw new Error(`Trash entry not found: ${trashId}`)
}

/**
 * Chunk records (Telegram message_id/channel_id) for a trashed file.
 *
 * After a soft delete the live file row is removed, which cascades the chunks
 * rows out of the DB, so the authoritative source is the `_chunks` snapshot
 * embedded in the trash row's file_data. Defensively, if chunk rows still
 * exist in the DB (legacy entries) they win, since they are the source of
 * truth for ordering.
 */
export function getTrashEntryChunks(entry: TrashEntry): Chunk[] {
  if (entry.file_id) {
    const live = getChunksByFileId(entry.file_id)
    if (live.length > 0) return live
  }

  if (!entry.file_data) return []
  try {
    const parsed = JSON.parse(entry.file_data) as File & { _chunks?: Chunk[] }
    return Array.isArray(parsed._chunks) ? parsed._chunks : []
  } catch {
    return []
  }
}

/**
 * Remove the local DB records for a trash entry — the chunk/version references
 * and the trash row itself, atomically.
 *
 * The manual "Remove from TeleVault" IPC path calls this only after its Telegram
 * message deletions succeed. The 30-day expiry sweep calls it deliberately
 * WITHOUT touching Telegram: consistent with the UI wording, expired rows lose
 * their local references while the file data stays in Telegram until the user
 * deletes the messages there.
 */
export function removeTrashEntryRecords(entry: TrashEntry): void {
  const db = getDb()
  db.transaction(() => {
    if (entry.file_id) {
      db.prepare('DELETE FROM chunks WHERE file_id = ?').run(entry.file_id)
      db.prepare('DELETE FROM versions WHERE file_id = ?').run(entry.file_id)
    }
    db.prepare('DELETE FROM trash WHERE id = ?').run(entry.id)
  })()
}

/**
 * Back-compat DB-first permanent delete, kept because vfs.deleteFile's
 * permanent branch delegates here (vfs.ts is out of scope for this fix).
 *
 * NOTE: the app's permanent-delete path is the ordered flow in
 * electron/ipc/files.ipc.ts — Telegram deletion FIRST, DB cleanup only after
 * it succeeds. This wrapper exists only so the vfs pass-through keeps working;
 * it must not be used for new call sites.
 */
export function permanentlyDeleteTrashEntry(trashId: string): {
  fileId: string
  chunks: Chunk[]
} {
  const entry = resolveTrashEntry(trashId)
  const chunks = getTrashEntryChunks(entry)
  removeTrashEntryRecords(entry)
  return { fileId: entry.file_id ?? '', chunks }
}

/**
 * All trash rows that have passed their 30-day retention window (`expires_at`,
 * set to deleted_at + 30 days in files.db.ts). The expiry sweep purges only the
 * local DB references for these rows; it never deletes Telegram messages.
 */
export function getExpiredTrashEntries(now: number = Date.now()): TrashEntry[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM trash WHERE expires_at < ? ORDER BY expires_at ASC')
    .all(now) as TrashEntry[]
}
