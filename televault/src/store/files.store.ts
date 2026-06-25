import { create } from 'zustand'
import type { VFSEntry } from '../types'

export type CurrentView = 'drive' | 'recent' | 'starred' | 'trash'

interface FilesStore {
  currentPath: string
  entries: VFSEntry[]
  isLoading: boolean
  selectedIds: Set<string>
  isTrashView: boolean
  currentView: CurrentView
  renamingId: string | null
  clipboard: { entryIds: string[]; mode: 'copy' | 'cut'; sourcePath: string } | null
  setPath: (path: string) => void
  setTrashView: (enabled: boolean) => void
  setCurrentView: (view: CurrentView) => void
  setRenamingId: (id: string | null) => void
  setClipboard: (clipboard: FilesStore['clipboard']) => void
  loadFolder: (path: string) => Promise<void>
  loadRecent: () => Promise<void>
  loadStarred: () => Promise<void>
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
  currentView: 'drive',
  renamingId: null,
  clipboard: null,

  setPath: (path) => {
    set({ currentPath: path, isTrashView: false, currentView: 'drive', selectedIds: new Set() })
  },

  setTrashView: (enabled) => {
    set({ isTrashView: enabled, currentView: enabled ? 'trash' : 'drive', selectedIds: new Set() })
  },

  setCurrentView: (view) => {
    set({ currentView: view, isTrashView: view === 'trash', selectedIds: new Set() })
  },

  setRenamingId: (id) => set({ renamingId: id }),

  setClipboard: (clipboard) => set({ clipboard }),

  loadFolder: async (path) => {
    set({ isLoading: true })
    try {
      const result = await window.televault.files.list(path)
      if (result.success && result.data) {
        set({ entries: result.data, currentPath: path, isLoading: false, currentView: 'drive', isTrashView: false })
      } else {
        set({ isLoading: false })
        throw new Error(result.error ?? 'Failed to load folder')
      }
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  loadRecent: async () => {
    set({ isLoading: true, currentView: 'recent', isTrashView: false })
    const result = await window.televault.files.recent(50)
    if (result.success && result.data) {
      set({ entries: result.data, isLoading: false })
    } else {
      set({ isLoading: false })
    }
  },

  loadStarred: async () => {
    set({ isLoading: true, currentView: 'starred', isTrashView: false })
    const result = await window.televault.files.starred()
    if (result.success && result.data) {
      set({ entries: result.data, isLoading: false })
    } else {
      set({ isLoading: false })
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
    const { currentPath, currentView } = get()
    set({ isLoading: true })

    if (currentView === 'recent') {
      const result = await window.televault.files.recent(50)
      if (result.success && result.data) set({ entries: result.data, isLoading: false })
      else set({ isLoading: false })
      return
    }

    if (currentView === 'starred') {
      const result = await window.televault.files.starred()
      if (result.success && result.data) set({ entries: result.data, isLoading: false })
      else set({ isLoading: false })
      return
    }

    if (currentView === 'trash') {
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
          starred: 0,
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
