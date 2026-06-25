import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import type { Folder } from './schema'

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[]
  fileCount: number
}

export function createFolder(
  name: string,
  parentId: string | null,
  folderPath: string
): Folder {
  const db = getDb()
  const now = Date.now()
  const folder: Folder = {
    id: uuidv4(),
    parent_id: parentId,
    name,
    path: folderPath,
    created_at: now,
    updated_at: now,
  }

  db.prepare(
    `INSERT INTO folders (id, parent_id, name, path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    folder.id,
    folder.parent_id,
    folder.name,
    folder.path,
    folder.created_at,
    folder.updated_at
  )

  return folder
}

export function getFolderByPath(folderPath: string): Folder | undefined {
  const db = getDb()
  return db
    .prepare('SELECT * FROM folders WHERE path = ?')
    .get(folderPath) as Folder | undefined
}

export function getFolderById(id: string): Folder | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as
    | Folder
    | undefined
}

export function getChildFolders(parentId: string | null): Folder[] {
  const db = getDb()
  if (parentId === null) {
    return db
      .prepare('SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name ASC')
      .all() as Folder[]
  }
  return db
    .prepare('SELECT * FROM folders WHERE parent_id = ? ORDER BY name ASC')
    .all(parentId) as Folder[]
}

export function getAllFolders(): Folder[] {
  const db = getDb()
  return db
    .prepare('SELECT * FROM folders ORDER BY path ASC')
    .all() as Folder[]
}

export function updateFolder(
  id: string,
  updates: Partial<Pick<Folder, 'name' | 'path' | 'parent_id' | 'updated_at'>>
): void {
  const db = getDb()
  const existing = getFolderById(id)
  if (!existing) {
    throw new Error(`Folder not found: ${id}`)
  }

  const updated: Folder = {
    ...existing,
    ...updates,
    updated_at: updates.updated_at ?? Date.now(),
  }

  db.prepare(
    `UPDATE folders
     SET parent_id = ?, name = ?, path = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    updated.parent_id,
    updated.name,
    updated.path,
    updated.updated_at,
    id
  )
}

export function deleteFolder(id: string): void {
  const db = getDb()
  const result = db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  if (result.changes === 0) {
    throw new Error(`Folder not found: ${id}`)
  }
}

export function getFolderTree(): FolderTreeNode[] {
  const db = getDb()
  const folders = getAllFolders()

  const countRows = db
    .prepare('SELECT folder_id, COUNT(*) AS count FROM files GROUP BY folder_id')
    .all() as Array<{ folder_id: string; count: number }>

  const fileCountByFolder = new Map<string, number>()
  for (const row of countRows) {
    fileCountByFolder.set(row.folder_id, row.count)
  }

  const nodeMap = new Map<string, FolderTreeNode>()
  for (const folder of folders) {
    nodeMap.set(folder.id, {
      ...folder,
      children: [],
      fileCount: fileCountByFolder.get(folder.id) ?? 0,
    })
  }

  const roots: FolderTreeNode[] = []
  for (const folder of folders) {
    const node = nodeMap.get(folder.id)
    if (!node) continue

    if (folder.parent_id === null) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(folder.parent_id)
      if (parent) {
        parent.children.push(node)
      }
    }
  }

  const sortNodes = (nodes: FolderTreeNode[]): void => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    for (const node of nodes) {
      sortNodes(node.children)
    }
  }
  sortNodes(roots)

  return roots
}

/**
 * Rename a folder. Updates all descendant folder and file paths in a transaction.
 */
export function renameFolder(id: string, newName: string): void {
  const db = getDb()
  const folder = getFolderById(id)
  if (!folder) throw new Error(`Folder not found: ${id}`)
  if (folder.path === '/') throw new Error('Cannot rename root folder')

  // Parent path: everything before the last '/'
  const lastSlash = folder.path.lastIndexOf('/')
  const parentPath = lastSlash > 0 ? folder.path.substring(0, lastSlash) : ''
  const newPath = `${parentPath}/${newName}`

  // Sibling collision check
  const existing = db
    .prepare('SELECT id FROM folders WHERE path = ? AND id != ?')
    .get(newPath, id)
  if (existing) throw new Error(`A folder named "${newName}" already exists here`)

  const oldPath = folder.path

  const tx = db.transaction(() => {
    // Rename this folder
    db.prepare(
      'UPDATE folders SET name = ?, path = ?, updated_at = ? WHERE id = ?'
    ).run(newName, newPath, Date.now(), id)

    // Rewrite all descendant folder paths
    const descFolders = db
      .prepare("SELECT id, path FROM folders WHERE path LIKE ?")
      .all(`${oldPath}/%`) as { id: string; path: string }[]
    for (const d of descFolders) {
      db.prepare('UPDATE folders SET path = ? WHERE id = ?').run(
        newPath + d.path.substring(oldPath.length),
        d.id
      )
    }

    // Rewrite all file paths inside this folder and descendants
    const descFiles = db
      .prepare("SELECT id, path FROM files WHERE path LIKE ?")
      .all(`${oldPath}/%`) as { id: string; path: string }[]
    for (const f of descFiles) {
      db.prepare('UPDATE files SET path = ? WHERE id = ?').run(
        newPath + f.path.substring(oldPath.length),
        f.id
      )
    }
  })
  tx()
}

/**
 * Move a folder to a new parent path. Updates parent_id, path, and all
 * descendant paths in a transaction. Guards against moving into own subtree.
 */
export function moveFolder(id: string, newParentPath: string): void {
  const db = getDb()
  const folder = getFolderById(id)
  if (!folder) throw new Error(`Folder not found: ${id}`)
  if (folder.path === '/') throw new Error('Cannot move root folder')

  const targetParent =
    newParentPath === '/' ? null : (db
      .prepare('SELECT * FROM folders WHERE path = ?')
      .get(newParentPath) as { id: string; path: string } | undefined)
  if (newParentPath !== '/' && !targetParent) {
    throw new Error(`Destination folder not found: ${newParentPath}`)
  }

  const folderName = folder.path.substring(folder.path.lastIndexOf('/') + 1)
  const newPath =
    newParentPath === '/' ? `/${folderName}` : `${newParentPath}/${folderName}`

  if (newPath === folder.path) return // no-op

  // Guard: cannot move into own subtree
  if (newPath.startsWith(folder.path + '/')) {
    throw new Error('Cannot move a folder into its own subfolder')
  }

  const oldPath = folder.path

  const tx = db.transaction(() => {
    db.prepare(
      'UPDATE folders SET parent_id = ?, path = ?, updated_at = ? WHERE id = ?'
    ).run(targetParent?.id ?? null, newPath, Date.now(), id)

    const descFolders = db
      .prepare("SELECT id, path FROM folders WHERE path LIKE ?")
      .all(`${oldPath}/%`) as { id: string; path: string }[]
    for (const d of descFolders) {
      db.prepare('UPDATE folders SET path = ? WHERE id = ?').run(
        newPath + d.path.substring(oldPath.length),
        d.id
      )
    }

    const descFiles = db
      .prepare("SELECT id, path FROM files WHERE path LIKE ?")
      .all(`${oldPath}/%`) as { id: string; path: string }[]
    for (const f of descFiles) {
      db.prepare('UPDATE files SET path = ? WHERE id = ?').run(
        newPath + f.path.substring(oldPath.length),
        f.id
      )
    }
  })
  tx()
}
