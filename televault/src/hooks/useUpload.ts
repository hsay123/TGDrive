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
  // ── Select only primitives from the store to avoid referential re-renders ──
  const queueLength = useUploadStore((s) => s.queue.length)
  const hasQueued   = useUploadStore((s) => s.queue.some((i) => i.status === 'queued'))

  // Keep mutable refs for store actions — these never change identity
  const markUploading   = useRef(useUploadStore.getState().markUploading)
  const updateProgress  = useRef(useUploadStore.getState().updateProgress)
  const markDone        = useRef(useUploadStore.getState().markDone)
  const markError       = useRef(useUploadStore.getState().markError)
  const markCancelled   = useRef(useUploadStore.getState().markCancelled)
  const refreshFolder   = useRef(useFilesStore.getState().refreshFolder)
  const loadTree        = useRef(useTreeStore.getState().loadTree)
  const processingRef   = useRef<Set<string>>(new Set())

  // ── Subscribe to progress events once on mount ───────────────────────────
  useEffect(() => {
    const unsub = window.televault.files.onUploadProgress(({ localPath, percent }) => {
      const item = useUploadStore
        .getState()
        .queue.find((q) => q.localPath === localPath && q.status === 'uploading')
      if (item) {
        updateProgress.current(item.id, percent)
      }
    })
    return unsub
  }, []) // empty deps — runs once

  // ── Process queue whenever a new item enters 'queued' status ─────────────
  useEffect(() => {
    if (!hasQueued) return

    const processQueue = async () => {
      // Read queue snapshot directly from store — avoids stale closure
      const pending = useUploadStore
        .getState()
        .queue.filter((item) => item.status === 'queued' && !processingRef.current.has(item.id))

      for (const item of pending) {
        processingRef.current.add(item.id)
        markUploading.current(item.id)

        try {
          const result = await window.televault.files.upload(
            item.localPath,
            item.destPath,
            item.encrypt,
            item.id
          )
          if (result.success) {
            markDone.current(item.id)
            await refreshFolder.current()
            await loadTree.current()
          } else if ((result as any).cancelled) {
            markCancelled.current(item.id)
          } else {
            const errorMsg = result.error ?? 'Upload failed'
            handleUploadError(errorMsg, item.id, markError.current)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed'
          if (error instanceof DOMException && error.name === 'AbortError') {
            markCancelled.current(item.id)
          } else {
            handleUploadError(message, item.id, markError.current)
          }
        } finally {
          processingRef.current.delete(item.id)
        }
      }
    }

    processQueue()
  }, [hasQueued, queueLength]) // primitives only — no object refs in deps
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
