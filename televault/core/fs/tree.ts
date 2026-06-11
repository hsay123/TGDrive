import { getDb } from '../db/db'
import { getAllFolders, updateFolder } from '../db/folders.db'
import { getFileById, updateFile } from '../db/files.db'

export function normalizePath(folderPath: string): string {
  if (!folderPath || folderPath === '/') {
    return '/'
  }
  const trimmed = folderPath.replace(/\\/g, '/').replace(/\/+/g, '/')
  return trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') || '/' : `/${trimmed}`
}

export function joinPath(parentPath: string, name: string): string {
  const parent = normalizePath(parentPath)
  if (parent === '/') {
    return `/${name}`
  }
  return `${parent}/${name}`
}

export function getParentPath(folderPath: string): string {
  const normalized = normalizePath(folderPath)
  if (normalized === '/') {
    return '/'
  }
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash) || '/'
}

export function getNameFromPath(folderPath: string): string {
  const normalized = normalizePath(folderPath)
  if (normalized === '/') {
    return ''
  }
  const lastSlash = normalized.lastIndexOf('/')
  return normalized.slice(lastSlash + 1)
}

export function updateDescendantPaths(oldPrefix: string, newPrefix: string): void {
  const db = getDb()
  const oldNorm = normalizePath(oldPrefix)
  const newNorm = normalizePath(newPrefix)

  if (oldNorm === newNorm) {
    return
  }

  const folders = getAllFolders()
  for (const folder of folders) {
    if (folder.path === oldNorm || folder.path.startsWith(`${oldNorm}/`)) {
      const suffix =
        folder.path === oldNorm ? '' : folder.path.slice(oldNorm.length)
      updateFolder(folder.id, {
        path: `${newNorm}${suffix}`,
        updated_at: Date.now(),
      })
    }
  }

  const files = db
    .prepare('SELECT id, path FROM files')
    .all() as Array<{ id: string; path: string }>

  for (const file of files) {
    if (file.path === oldNorm || file.path.startsWith(`${oldNorm}/`)) {
      const suffix =
        file.path === oldNorm ? '' : file.path.slice(oldNorm.length)
      const fileRecord = getFileById(file.id)
      if (fileRecord) {
        updateFile(file.id, {
          path: `${newNorm}${suffix}`,
          updated_at: Date.now(),
        })
      }
    }
  }
}
