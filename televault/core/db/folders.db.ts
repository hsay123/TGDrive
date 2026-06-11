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
