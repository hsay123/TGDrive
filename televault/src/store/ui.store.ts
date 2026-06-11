import { create } from 'zustand'

interface UIStore {
  viewMode: 'grid' | 'list'
  sidebarOpen: boolean
  activeModal: string | null
  searchQuery: string
  previewEntryId: string | null
  isDraggingOver: boolean
  showUpgradeModal: boolean
  setViewMode: (mode: 'grid' | 'list') => void
  toggleSidebar: () => void
  openModal: (name: string) => void
  closeModal: () => void
  setSearchQuery: (q: string) => void
  setPreviewEntryId: (id: string | null) => void
  setDraggingOver: (v: boolean) => void
  openUpgradeModal: () => void
  closeUpgradeModal: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  viewMode: 'grid',
  sidebarOpen: true,
  activeModal: null,
  searchQuery: '',
  previewEntryId: null,
  isDraggingOver: false,
  showUpgradeModal: false,

  setViewMode: (mode) => set({ viewMode: mode }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  openModal: (name) => set({ activeModal: name }),
  closeModal: () => set({ activeModal: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setPreviewEntryId: (id) => set({ previewEntryId: id }),
  setDraggingOver: (v) => set({ isDraggingOver: v }),
  openUpgradeModal: () => set({ showUpgradeModal: true }),
  closeUpgradeModal: () => set({ showUpgradeModal: false }),
}))
