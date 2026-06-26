import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface UploadItem {
  id: string
  name: string
  localPath: string
  destPath: string
  size: number
  encrypt: boolean
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'
  error?: string
}

interface UploadStore {
  queue: UploadItem[]
  isVisible: boolean
  setVisible: (v: boolean) => void
  addToQueue: (
    items: Array<{ name: string; localPath: string; size: number }>,
    destPath: string,
    encrypt: boolean
  ) => void
  updateProgress: (id: string, progress: number) => void
  markUploading: (id: string) => void
  markDone: (id: string) => void
  markError: (id: string, error: string) => void
  markCancelled: (id: string) => void
  clearDone: () => void
}

const checkAutoDismiss = (set: any, get: any, id: string, status: string) => {
  const { queue } = get()
  const allDone = queue.every((i: UploadItem) =>
    i.id === id
      ? ['done', 'error', 'cancelled'].includes(status)
      : ['done', 'error', 'cancelled'].includes(i.status)
  )
  if (allDone && queue.length > 0) {
    setTimeout(() => {
      const currentQueue = get().queue
      const stillAllDone = currentQueue.every((i: UploadItem) =>
        ['done', 'error', 'cancelled'].includes(i.status)
      )
      if (stillAllDone && currentQueue.length > 0) {
        set({ isVisible: false })
        setTimeout(() => {
          set((s: UploadStore) => ({
            queue: s.queue.filter((i) => i.status === 'uploading' || i.status === 'queued'),
          }))
        }, 300)
      }
    }, 3000)
  }
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  queue: [],
  isVisible: false,

  setVisible: (isVisible) => set({ isVisible }),

  addToQueue: (items, destPath, encrypt) => {
    const newItems: UploadItem[] = items.map((item) => ({
      id: uuidv4(),
      name: item.name,
      localPath: item.localPath,
      destPath,
      size: item.size,
      encrypt,
      progress: 0,
      status: 'queued',
    }))
    set((state) => ({ queue: [...state.queue, ...newItems], isVisible: true }))
  },

  updateProgress: (id, progress) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, progress, status: 'uploading' as const } : item
      ),
    }))
  },

  markUploading: (id) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, status: 'uploading' as const } : item
      ),
    }))
  },

  markDone: (id) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, progress: 100, status: 'done' as const } : item
      ),
    }))
    checkAutoDismiss(set, get, id, 'done')
  },

  markError: (id, error) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, status: 'error' as const, error } : item
      ),
    }))
    checkAutoDismiss(set, get, id, 'error')
  },

  markCancelled: (id) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, status: 'cancelled' as const } : item
      ),
    }))
    checkAutoDismiss(set, get, id, 'cancelled')
  },

  clearDone: () => {
    set((state) => {
      const remaining = state.queue.filter(
        (item) => item.status !== 'done' && item.status !== 'cancelled'
      )
      return { queue: remaining, isVisible: remaining.length > 0 ? state.isVisible : false }
    })
  },
}))
