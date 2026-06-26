import { create } from 'zustand'

export interface DownloadItem {
  id: string
  fileName: string
  size: number
  downloaded: number   // bytes so far
  progress: number     // 0–100
  speed: number        // bytes/sec (rolling)
  status: 'downloading' | 'done' | 'cancelled' | 'error'
  error?: string
  savedTo?: string
}

interface DownloadState {
  queue: DownloadItem[]
  isVisible: boolean
  addToQueue: (item: Pick<DownloadItem, 'id' | 'fileName' | 'size'>) => void
  updateProgress: (id: string, downloaded: number, total: number, speed: number) => void
  setStatus: (id: string, status: DownloadItem['status'], extra?: Partial<DownloadItem>) => void
  clearCompleted: () => void
  setVisible: (v: boolean) => void
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  queue: [],
  isVisible: false,

  addToQueue: (item) =>
    set((s) => ({
      queue: [
        ...s.queue,
        { ...item, downloaded: 0, progress: 0, speed: 0, status: 'downloading' },
      ],
      isVisible: true,
    })),

  updateProgress: (id, downloaded, total, speed) =>
    set((s) => ({
      queue: s.queue.map((item) =>
        item.id === id
          ? {
              ...item,
              downloaded,
              progress: total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0,
              speed,
            }
          : item
      ),
    })),

  setStatus: (id, status, extra = {}) => {
    set((s) => ({
      queue: s.queue.map((item) =>
        item.id === id ? { ...item, status, ...extra } : item
      ),
    }))

    const { queue } = get()
    const allDone = queue.every(i =>
      i.id === id
        ? ['done', 'error', 'cancelled'].includes(status)
        : ['done', 'error', 'cancelled'].includes(i.status)
    )
    if (allDone && queue.length > 0) {
      setTimeout(() => {
        const currentQueue = get().queue
        const stillAllDone = currentQueue.every((i) =>
          ['done', 'error', 'cancelled'].includes(i.status)
        )
        if (stillAllDone && currentQueue.length > 0) {
          set({ isVisible: false })
          setTimeout(() => {
            set({ queue: [] })
          }, 300)
        }
      }, 3000)
    }
  },

  clearCompleted: () =>
    set((s) => {
      const remaining = s.queue.filter((i) => i.status === 'downloading')
      return { queue: remaining, isVisible: remaining.length > 0 ? s.isVisible : false }
    }),

  setVisible: (isVisible) => set({ isVisible }),
}))
