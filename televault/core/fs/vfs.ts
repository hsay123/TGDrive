import path from 'path'
import {
  createFolder,
  getFolderById,
  getFolderByPath,
  deleteFolder as deleteFolderRecord,
  getFolderTree,
  renameFolder as dbRenameFolder,
  moveFolder as dbMoveFolder,
  type FolderTreeNode,
} from '../db/folders.db'
import {
  getFileById,
  softDeleteFile,
  moveFile,
  searchFiles as dbSearchFiles,
  getRecentFiles as dbGetRecentFiles,
  getStarredFiles as dbGetStarredFiles,
  toggleStar as dbToggleStar,
  renameFile as dbRenameFile,
  toggleHidden as dbToggleHidden,
} from '../db/files.db'
import { getDb } from '../db/db'
import { restoreFromTrash, trashFolderContents, permanentlyDeleteTrashEntry } from '../db/trash.db'
import { getSetting, setSetting } from '../db/settings.db'
import { toggleFolderHidden as dbToggleFolderHidden } from '../db/folders.db'
import { isRevealGateUnlocked } from '../reveal-gate'
import { uploadFile as telegramUpload } from '../telegram/uploader'
import { downloadFile as telegramDownload } from '../telegram/downloader'
import {
  normalizePath,
  joinPath,
  getParentPath,
  getNameFromPath,
} from './tree'

export interface VFSFile {
  id: string
  type: 'file'
  name: string
  path: string
  size: number
  mimeType: string | null
  folderId: string
  isEncrypted: boolean
  isChunked: boolean
  chunkCount: number
  uploadedAt: number
  updatedAt: number
  thumbnailPath: string | null
  starred: number
  isHidden: number
}

export interface VFSFolder {
  id: string
  type: 'folder'
  name: string
  path: string
  parentId: string | null
  createdAt: number
  updatedAt: number
  children: VFSFolder[]
  fileCount: number
  isHidden: number
}

export type VFSEntry = VFSFile | VFSFolder

function mapFile(file: import('../db/schema').File): VFSFile {
  return {
    id: file.id,
    type: 'file',
    name: file.name,
    path: file.path,
    size: file.size,
    mimeType: file.mime_type,
    folderId: file.folder_id,
    isEncrypted: file.is_encrypted === 1,
    isChunked: file.is_chunked === 1,
    chunkCount: file.chunk_count,
    uploadedAt: file.uploaded_at,
    updatedAt: file.updated_at,
    thumbnailPath: file.thumbnail_path,
    starred: file.starred ?? 0,
    isHidden: file.is_hidden ?? 0,
  }
}

function mapFolderNode(node: FolderTreeNode): VFSFolder {
  return {
    id: node.id,
    type: 'folder',
    name: node.name,
    path: node.path,
    parentId: node.parent_id,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
    children: node.children.map(mapFolderNode),
    fileCount: node.fileCount,
    isHidden: node.is_hidden ?? 0,
  }
}

function mapFolder(folder: import('../db/schema').Folder): VFSFolder {
  return {
    id: folder.id,
    type: 'folder',
    name: folder.name,
    path: folder.path,
    parentId: folder.parent_id,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
    children: [],
    fileCount: 0,
    isHidden: folder.is_hidden ?? 0,
  }
}

export function ensureRootFolder(): void {
  const root = getFolderByPath('/')
  if (!root) {
    createFolder('Root', null, '/')
  }
}

export async function listFolder(folderPath: string): Promise<VFSEntry[]> {
  ensureRootFolder()
  const normalized = normalizePath(folderPath)
  const db = getDb()
  const folder = db
    .prepare('SELECT * FROM folders WHERE path = ?')
    .get(normalized) as import('../db/schema').Folder | undefined
  if (!folder) {
    throw new Error(`Folder not found: ${normalized}`)
  }

  const includeHidden = isRevealGateUnlocked()
  const folderId = folder.id

  // Query 1 — child folders with file counts computed in ONE correlated
  // subquery (no per-folder COUNT calls — O(1) DB operations, not O(n)).
  const hiddenFilter = includeHidden ? '' : 'AND is_hidden = 0'
  const subfolders = db
    .prepare(`
      SELECT f.*,
        (SELECT COUNT(*) FROM files WHERE folder_id = f.id ${includeHidden ? '' : 'AND is_hidden = 0'}) AS file_count
      FROM folders f
      WHERE f.parent_id = ? ${hiddenFilter}
      ORDER BY f.name ASC
    `)
    .all(folderId) as (import('../db/schema').Folder & { file_count: number })[]

  // Query 2 — files in this folder (flat, no joins).
  const files = db
    .prepare(
      includeHidden
        ? 'SELECT * FROM files WHERE folder_id = ? ORDER BY name ASC'
        : 'SELECT * FROM files WHERE folder_id = ? AND is_hidden = 0 ORDER BY name ASC'
    )
    .all(folderId) as import('../db/schema').File[]

  const folderEntries: VFSEntry[] = subfolders.map((f) => ({
    id: f.id,
    type: 'folder',
    name: f.name,
    path: f.path,
    parentId: f.parent_id,
    createdAt: f.created_at,
    updatedAt: f.updated_at,
    children: [],
    fileCount: f.file_count,
    isHidden: f.is_hidden ?? 0,
  }))

  const fileEntries: VFSEntry[] = files.map(mapFile)
  return [...folderEntries, ...fileEntries]
}

export async function createFolderAtPath(folderPath: string): Promise<VFSFolder> {
  ensureRootFolder()
  const normalized = normalizePath(folderPath)
  if (normalized === '/') {
    const root = getFolderByPath('/')
    if (!root) {
      throw new Error('Root folder missing')
    }
    return mapFolder(root)
  }

  const existing = getFolderByPath(normalized)
  if (existing) {
    return mapFolder(existing)
  }

  const parentPath = getParentPath(normalized)
  const name = getNameFromPath(normalized)
  const parent = getFolderByPath(parentPath)
  if (!parent) {
    throw new Error(`Parent folder not found: ${parentPath}`)
  }

  const folder = createFolder(name, parent.id, normalized)
  return mapFolder(folder)
}

export interface UploadFileOptions {
  localPath: string
  destFolderPath: string
  encrypt: boolean
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}

export async function uploadFile(options: UploadFileOptions): Promise<VFSFile> {
  ensureRootFolder()
  const folderPath = normalizePath(options.destFolderPath)
  const folder = getFolderByPath(folderPath)
  if (!folder) {
    throw new Error(`Destination folder not found: ${folderPath}`)
  }

  const fileName = path.basename(options.localPath)
  const destPath = joinPath(folderPath, fileName)

  const previousEncryption = getSetting('encryption_enabled')
  setSetting('encryption_enabled', options.encrypt ? '1' : '0')

  try {
    const file = await telegramUpload(
      options.localPath,
      destPath,
      options.onProgress,
      options.signal
    )
    return mapFile(file)
  } finally {
    if (previousEncryption !== null) {
      setSetting('encryption_enabled', previousEncryption)
    } else {
      setSetting('encryption_enabled', '0')
    }
  }
}

export async function downloadFile(
  fileId: string,
  destPath: string,
  onProgress?: (percent: number, downloaded: number, total: number) => void
): Promise<void> {
  await telegramDownload(fileId, destPath, onProgress)
}

export async function deleteFile(
  fileId: string,
  permanent = false
): Promise<{ fileId: string; chunks: import('../db/schema').Chunk[] } | void> {
  if (permanent) {
    // fileId here is actually a trash entry ID — look up from trash table,
    // clean up chunks/versions, and return chunk info for Telegram cleanup
    return permanentlyDeleteTrashEntry(fileId)
  } else {
    softDeleteFile(fileId)
  }
}

export async function moveFileToFolder(
  fileId: string,
  newFolderPath: string
): Promise<void> {
  const file = getFileById(fileId)
  if (!file) {
    throw new Error(`File not found: ${fileId}`)
  }

  const folderPath = normalizePath(newFolderPath)
  const folder = getFolderByPath(folderPath)
  if (!folder) {
    throw new Error(`Folder not found: ${folderPath}`)
  }

  const newPath = joinPath(folderPath, file.name)
  moveFile(fileId, folder.id, newPath)
}

export async function renameFile(
  fileId: string,
  newName: string
): Promise<void> {
  // Delegates to DB-level rename which has the collision check
  dbRenameFile(fileId, newName)
}

export async function restoreFile(trashId: string): Promise<void> {
  restoreFromTrash(trashId)
}

export async function searchFiles(query: string): Promise<VFSFile[]> {
  return dbSearchFiles(query, isRevealGateUnlocked()).map(mapFile)
}

export async function getRecentFiles(limit = 50): Promise<VFSFile[]> {
  return dbGetRecentFiles(limit, isRevealGateUnlocked()).map(mapFile)
}

export async function getStarredFiles(): Promise<VFSFile[]> {
  return dbGetStarredFiles(isRevealGateUnlocked()).map(mapFile)
}

export async function toggleStar(fileId: string): Promise<boolean> {
  return dbToggleStar(fileId)
}

export async function getTree(): Promise<VFSFolder> {
  ensureRootFolder()
  const roots = getFolderTree(isRevealGateUnlocked())

  if (roots.length === 0) {
    const root = getFolderByPath('/')
    if (!root) {
      throw new Error('Root folder missing')
    }
    return mapFolder(root)
  }

  const root = roots.find((r) => r.path === '/') ?? roots[0]
  return mapFolderNode(root)
}

export async function deleteFolderById(folderId: string): Promise<void> {
  const folder = getFolderById(folderId)
  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }
  if (folder.path === '/') {
    throw new Error('Cannot delete root folder')
  }

  trashFolderContents(folderId)
  deleteFolderRecord(folderId)
}

export async function renameFolder(
  folderId: string,
  newName: string
): Promise<void> {
  // Delegates to DB-level rename which handles descendant rewrite atomically
  dbRenameFolder(folderId, newName)
}

export async function moveFolder(
  folderId: string,
  newParentPath: string
): Promise<void> {
  // Delegates to DB-level move which handles descendant rewrite atomically
  dbMoveFolder(folderId, normalizePath(newParentPath))
}

export async function toggleFileHidden(fileId: string): Promise<boolean> {
  return dbToggleHidden(fileId)
}

export async function toggleFolderHidden(folderId: string): Promise<boolean> {
  return dbToggleFolderHidden(folderId)
}
