import { create } from 'zustand'
import type { VFSFolder } from '../types'

interface TreeStore {
  tree: VFSFolder | null
  expandedIds: Set<string>
  loadTree: () => Promise<void>
  toggleExpand: (id: string) => void
  expandPath: (path: string) => void
}

function collectFolderIds(folder: VFSFolder, targetPath: string): string[] {
  const ids: string[] = []
  if (targetPath === folder.path || targetPath.startsWith(`${folder.path}/`)) {
    ids.push(folder.id)
  }
  for (const child of folder.children) {
    ids.push(...collectFolderIds(child, targetPath))
  }
  return ids
}

export const useTreeStore = create<TreeStore>((set, get) => ({
  tree: null,
  expandedIds: new Set<string>(),

  loadTree: async () => {
    const result = await window.televault.folders.getTree()
    if (result.success && result.data) {
      set({ tree: result.data })
    }
  },

  toggleExpand: (id) => {
    const { expandedIds } = get()
    const next = new Set(expandedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    set({ expandedIds: next })
  },

  expandPath: (path) => {
    const { tree, expandedIds } = get()
    if (!tree) return
    const ids = collectFolderIds(tree, path)
    const next = new Set(expandedIds)
    ids.forEach((id) => next.add(id))
    set({ expandedIds: next })
  },
}))
