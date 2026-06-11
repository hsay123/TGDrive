import { useState, useEffect, useCallback } from 'react'
import type { SyncStatus } from '../../electron/types'

export function useSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)

  const refreshStatus = useCallback(async () => {
    const result = await window.televault.sync.getStatus()
    if (result.success && result.data) {
      setStatus(result.data)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 30000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const push = async () => {
    setIsSyncing(true)
    try {
      const result = await window.televault.sync.push()
      if (!result.success) throw new Error(result.error)
      await refreshStatus()
    } finally {
      setIsSyncing(false)
    }
  }

  const pull = async () => {
    setIsSyncing(true)
    try {
      const result = await window.televault.sync.pull()
      if (!result.success) throw new Error(result.error)
      await refreshStatus()
    } finally {
      setIsSyncing(false)
    }
  }

  return { status, isSyncing, push, pull, refreshStatus }
}
