import { useEffect, useRef } from 'react'
import { useUploadStore } from '../store/upload.store'
import { useFilesStore } from '../store/files.store'
import { useTreeStore } from '../store/tree.store'
import toast from 'react-hot-toast'

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
            markError(item.id, result.error ?? 'Upload failed')
            toast.error(result.error ?? 'Upload failed')
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed'
          markError(item.id, message)
          toast.error(message)
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
