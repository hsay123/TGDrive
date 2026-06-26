import { useEffect } from 'react'
import { useDownloadStore } from '../store/download.store'

export function useDownloadListener() {
  const addToQueue = useDownloadStore((s) => s.addToQueue)
  const updateProgress = useDownloadStore((s) => s.updateProgress)
  const setStatus = useDownloadStore((s) => s.setStatus)

  useEffect(() => {
    const unsubStarted = window.televault.files.onDownloadStarted((data) => {
      addToQueue({ id: data.id, fileName: data.fileName, size: data.size })
    })

    const unsubUpdate = window.televault.files.onDownloadUpdate((data) => {
      updateProgress(data.id, data.downloaded, data.total, data.speed)
    })

    const unsubDone = window.televault.files.onDownloadDone((data) => {
      setStatus(data.id, 'done', { savedTo: data.savedTo, progress: 100 })
    })

    return () => {
      unsubStarted()
      unsubUpdate()
      unsubDone()
    }
  }, [addToQueue, updateProgress, setStatus])
}
