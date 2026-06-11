import { create } from 'zustand'
import type { VFSEntry } from '../types'

interface FilesStore {
  currentPath: string
  entries: VFSEntry[]
  isLoading: boolean
  selectedIds: Set<string>
  isTrashView: boolean
  setPath: (path: string) => void
  setTrashView: (enabled: boolean) => void
  loadFolder: (path: string) => Promise<void>
  selectFile: (id: string, multi: boolean, rangeIds?: string[]) => void
  clearSelection: () => void
  refreshFolder: () => Promise<void>
}

export const useFilesStore = create<FilesStore>((set, get) => ({
  currentPath: '/',
  entries: [],
  isLoading: false,
  selectedIds: new Set<string>(),
  isTrashView: false,

  setPath: (path) => {
    set({ currentPath: path, isTrashView: false, selectedIds: new Set() })
  },

  setTrashView: (enabled) => {
    set({ isTrashView: enabled, selectedIds: new Set() })
  },

  loadFolder: async (path) => {
    set({ isLoading: true })
    try {
      const result = await window.televault.files.list(path)
      if (result.success && result.data) {
        set({ entries: result.data, currentPath: path, isLoading: false })
      } else {
        set({ isLoading: false })
        throw new Error(result.error ?? 'Failed to load folder')
      }
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  selectFile: (id, multi, rangeIds) => {
    const { selectedIds } = get()
    const next = new Set(selectedIds)

    if (rangeIds && rangeIds.length > 0) {
      rangeIds.forEach((rid) => next.add(rid))
    } else if (multi) {
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
    } else {
      next.clear()
      next.add(id)
    }

    set({ selectedIds: next })
  },

  clearSelection: () => {
    set({ selectedIds: new Set() })
  },

  refreshFolder: async () => {
    const { currentPath, isTrashView } = get()
    if (isTrashView) {
      set({ isLoading: true })
      const result = await window.televault.files.getTrash()
      if (result.success && result.data) {
        const entries: VFSEntry[] = result.data.map((t) => ({
          id: t.id,
          type: 'file' as const,
          name: t.name,
          path: t.originalPath,
          size: t.size,
          mimeType: null,
          folderId: t.folderId ?? '',
          isEncrypted: false,
          isChunked: false,
          chunkCount: 1,
          uploadedAt: t.deletedAt,
          updatedAt: t.deletedAt,
          thumbnailPath: null,
        }))
        set({ entries, isLoading: false })
      } else {
        set({ isLoading: false })
      }
      return
    }
    await get().loadFolder(currentPath)
  },
}))
