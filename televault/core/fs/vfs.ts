import path from 'path'
import {
  createFolder,
  getFolderById,
  getFolderByPath,
  getChildFolders,
  deleteFolder as deleteFolderRecord,
  updateFolder,
  getFolderTree,
  type FolderTreeNode,
} from '../db/folders.db'
import {
  getFilesByFolder,
  getFileById,
  softDeleteFile,
  moveFile,
  updateFile,
  searchFiles as dbSearchFiles,
} from '../db/files.db'
import { restoreFromTrash, trashFolderContents, permanentlyDeleteTrashEntry } from '../db/trash.db'
import { getSetting, setSetting } from '../db/settings.db'
import { uploadFile as telegramUpload } from '../telegram/uploader'
import { downloadFile as telegramDownload } from '../telegram/downloader'
import {
  normalizePath,
  joinPath,
  getParentPath,
  getNameFromPath,
  updateDescendantPaths,
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
  const folder = getFolderByPath(normalized)
  if (!folder) {
    throw new Error(`Folder not found: ${normalized}`)
  }

  const subfolders = getChildFolders(folder.id).map(mapFolder)
  const files = getFilesByFolder(folder.id).map(mapFile)
  return [...subfolders, ...files]
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
      options.onProgress
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
  onProgress?: (percent: number) => void
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
  const file = getFileById(fileId)
  if (!file) {
    throw new Error(`File not found: ${fileId}`)
  }

  const folder = getFolderById(file.folder_id)
  if (!folder) {
    throw new Error(`Parent folder not found for file: ${fileId}`)
  }

  const newPath = joinPath(folder.path, newName)
  updateFile(fileId, {
    name: newName,
    path: newPath,
    updated_at: Date.now(),
  })
}

export async function restoreFile(trashId: string): Promise<void> {
  restoreFromTrash(trashId)
}

export async function searchFiles(query: string): Promise<VFSFile[]> {
  return dbSearchFiles(query).map(mapFile)
}

export async function getTree(): Promise<VFSFolder> {
  ensureRootFolder()
  const roots = getFolderTree()

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
  const folder = getFolderById(folderId)
  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }
  if (folder.path === '/') {
    throw new Error('Cannot rename root folder')
  }

  const parentPath = getParentPath(folder.path)
  const newPath = joinPath(parentPath, newName)
  updateDescendantPaths(folder.path, newPath)
  updateFolder(folderId, {
    name: newName,
    path: newPath,
    updated_at: Date.now(),
  })
}

export async function moveFolder(
  folderId: string,
  newParentPath: string
): Promise<void> {
  const folder = getFolderById(folderId)
  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`)
  }
  if (folder.path === '/') {
    throw new Error('Cannot move root folder')
  }

  const parentPath = normalizePath(newParentPath)
  const parent = getFolderByPath(parentPath)
  if (!parent) {
    throw new Error(`Parent folder not found: ${parentPath}`)
  }

  const newPath = joinPath(parentPath, folder.name)
  updateDescendantPaths(folder.path, newPath)
  updateFolder(folderId, {
    parent_id: parent.id,
    path: newPath,
    updated_at: Date.now(),
  })
}
