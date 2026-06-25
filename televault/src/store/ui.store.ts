import { create } from 'zustand'

interface MoveToModal {
  entryIds: string[]
  entryType: 'file' | 'folder'
}

interface UIStore {
  viewMode: 'grid' | 'list'
  sidebarOpen: boolean
  activeModal: string | null
  searchQuery: string
  previewEntryId: string | null
  isDraggingOver: boolean
  moveToModal: MoveToModal | null
  versionHistoryEntryId: string | null
  clipboard: { entryIds: string[]; mode: 'copy' | 'cut' } | null
  setViewMode: (mode: 'grid' | 'list') => void
  toggleSidebar: () => void
  openModal: (name: string) => void
  closeModal: () => void
  setSearchQuery: (q: string) => void
  setPreviewEntryId: (id: string | null) => void
  setDraggingOver: (v: boolean) => void
  openMoveToModal: (entryIds: string[], entryType: 'file' | 'folder') => void
  closeMoveToModal: () => void
  setVersionHistoryEntryId: (id: string | null) => void
  setClipboard: (c: UIStore['clipboard']) => void
}

export const useUIStore = create<UIStore>((set) => ({
  viewMode: 'grid',
  sidebarOpen: true,
  activeModal: null,
  searchQuery: '',
  previewEntryId: null,
  isDraggingOver: false,
  moveToModal: null,
  versionHistoryEntryId: null,
  clipboard: null,

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  openModal: (name) => set({ activeModal: name }),
  closeModal: () => set({ activeModal: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setPreviewEntryId: (id) => set({ previewEntryId: id }),
  setDraggingOver: (v) => set({ isDraggingOver: v }),
  openMoveToModal: (entryIds, entryType) => set({ moveToModal: { entryIds, entryType } }),
  closeMoveToModal: () => set({ moveToModal: null }),
  setVersionHistoryEntryId: (id) => set({ versionHistoryEntryId: id }),
  setClipboard: (c) => set({ clipboard: c }),
}))
