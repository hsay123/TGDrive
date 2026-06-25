import { useEffect, useRef } from 'react'
import { useUploadStore } from '../store/upload.store'
import { useFilesStore } from '../store/files.store'
import { useTreeStore } from '../store/tree.store'
import toast from 'react-hot-toast'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function useUpload() {
  const queue = useUploadStore((s) => s.queue)
  const markUploading = useUploadStore((s) => s.markUploading)
  const updateProgress = useUploadStore((s) => s.updateProgress)
  const markDone = useUploadStore((s) => s.markDone)
  const markError = useUploadStore((s) => s.markError)
  const refreshFolder = useFilesStore((s) => s.refreshFolder)
  const loadTree = useTreeStore((s) => s.loadTree)
  const processingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const unsub = window.televault.files.onUploadProgress(({ localPath, percent }) => {
      const item = useUploadStore
        .getState()
        .queue.find((q) => q.localPath === localPath && q.status === 'uploading')
      if (item) {
        updateProgress(item.id, percent)
      }
    })
    return unsub
  }, [updateProgress])

  useEffect(() => {
    const processQueue = async () => {
      const pending = queue.filter(
        (item) => item.status === 'queued' && !processingRef.current.has(item.id)
      )

      for (const item of pending) {
        processingRef.current.add(item.id)
        markUploading(item.id)

        try {
          const result = await window.televault.files.upload(
            item.localPath,
            item.destPath,
            item.encrypt
          )
          if (result.success) {
            markDone(item.id)
            await refreshFolder()
            await loadTree()
          } else {
            const errorMsg = result.error ?? 'Upload failed'
            handleUploadError(errorMsg, item.id, markError)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed'
          handleUploadError(message, item.id, markError)
        } finally {
          processingRef.current.delete(item.id)
        }
      }
    }

    if (queue.some((item) => item.status === 'queued')) {
      processQueue()
    }
  }, [queue, markUploading, markDone, markError, refreshFolder, loadTree])
}

function handleUploadError(
  message: string,
  itemId: string,
  markError: (id: string, err: string) => void,
): void {
  if (message.startsWith('DISK_FULL:')) {
    try {
      const info = JSON.parse(message.replace('DISK_FULL:', '')) as {
        free: number
        needed: number
      }
      const shortfall = formatBytes(info.needed - info.free)
      const friendlyMsg = `Not enough disk space. Free up at least ${shortfall} and try again.`
      markError(itemId, friendlyMsg)
      toast.error(friendlyMsg, { duration: 6000 })
      return
    } catch { /* fall through */ }
  }

  markError(itemId, message)
  toast.error(message)
}
