import { useEffect, useRef, useCallback } from 'react'
import { UploadCloud } from 'lucide-react'
import { useFilesStore } from '../../store/files.store'
import { useUploadStore } from '../../store/upload.store'
import { useUIStore } from '../../store/ui.store'

interface FileSystemEntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
  file: (callback: (file: File) => void) => void
  createReader: () => {
    readEntries: (callback: (entries: FileSystemEntryLike[]) => void) => void
  }
}

async function readEntry(
  entry: FileSystemEntryLike
): Promise<Array<{ name: string; localPath: string; size: number }>> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => {
        const path = (file as File & { path?: string }).path
        if (path) {
          resolve([{ name: file.name, localPath: path, size: file.size }])
        } else {
          resolve([])
        }
      })
    })
  }

  if (entry.isDirectory) {
    const reader = entry.createReader()
    const allEntries: FileSystemEntryLike[] = []

    await new Promise<void>((resolve) => {
      const readBatch = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve()
          } else {
            allEntries.push(...entries)
            readBatch()
          }
        })
      }
      readBatch()
    })

    const results: Array<{ name: string; localPath: string; size: number }> = []
    for (const child of allEntries) {
      results.push(...(await readEntry(child)))
    }
    return results
  }

  return []
}

export function DropZone() {
  const dragCounter = useRef(0)
  const currentPath = useFilesStore((s) => s.currentPath)
  const addToQueue = useUploadStore((s) => s.addToQueue)
  const isDraggingOver = useUIStore((s) => s.isDraggingOver)
  const setDraggingOver = useUIStore((s) => s.setDraggingOver)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounter.current += 1
    setDraggingOver(true)
  }, [setDraggingOver])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setDraggingOver(false)
    }
  }, [setDraggingOver])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setDraggingOver(false)

      const items = e.dataTransfer?.items
      if (!items) return

      const filesToUpload: Array<{ name: string; localPath: string; size: number }> = []

      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null
          if (entry) {
            filesToUpload.push(...(await readEntry(entry)))
          } else {
            const file = item.getAsFile()
            if (file) {
              const path = (file as File & { path?: string }).path
              if (path) {
                filesToUpload.push({ name: file.name, localPath: path, size: file.size })
              }
            }
          }
        }
      }

      if (filesToUpload.length > 0) {
        addToQueue(filesToUpload, currentPath, false)
      }
    },
    [addToQueue, currentPath, setDraggingOver]
  )

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', handleDrop)
    }
  }, [handleDragEnter, handleDragLeave, handleDrop])

  if (!isDraggingOver) return null

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-violet-600/10 border-2 border-dashed border-violet-500 pointer-events-none">
      <UploadCloud className="h-16 w-16 text-violet-500 mb-4" />
      <p className="text-lg font-semibold text-violet-200">Drop files to upload</p>
      <p className="mt-1 text-sm text-violet-400/80">to {currentPath}</p>
    </div>
  )
}
