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
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
}

interface UploadStore {
  queue: UploadItem[]
  addToQueue: (
    items: Array<{ name: string; localPath: string; size: number }>,
    destPath: string,
    encrypt: boolean
  ) => void
  updateProgress: (id: string, progress: number) => void
  markUploading: (id: string) => void
  markDone: (id: string) => void
  markError: (id: string, error: string) => void
  clearDone: () => void
}

export const useUploadStore = create<UploadStore>((set) => ({
  queue: [],

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
    set((state) => ({ queue: [...state.queue, ...newItems] }))
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
  },

  markError: (id, error) => {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.id === id ? { ...item, status: 'error' as const, error } : item
      ),
    }))
  },

  clearDone: () => {
    set((state) => ({
      queue: state.queue.filter((item) => item.status !== 'done'),
    }))
  },
}))
