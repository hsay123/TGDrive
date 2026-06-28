import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useSync } from '../../hooks/useSync'
import { useFilesStore } from '../../store/files.store'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { STORAGE_LIMIT_LABEL } from '../../utils/constants'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

export function StatusBar() {
  const { status, isSyncing, push, pull } = useSync()
  const entries = useFilesStore((s) => s.entries)
  const selectedIds = useFilesStore((s) => s.selectedIds)
  const [version, setVersion] = useState('0.1.0')
  const [storageUsed, setStorageUsed] = useState(0)

  useEffect(() => {
    window.televault.system.getAppVersion().then((r) => {
      if (r.success && r.data) setVersion(r.data)
    })
  }, [])

  useEffect(() => {
    async function loadStorage() {
      try {
        const result = await window.televault.files.storageUsed()
        if (result.success && result.data) {
          setStorageUsed(result.data.bytes)
        }
      } catch {
        // non-fatal
      }
    }
    loadStorage()
  }, [entries])

  const fileCount = entries.length
  const selectedCount = selectedIds.size

  const formatSyncTime = (ts: number | null | undefined) => {
    if (!ts) return 'Never synced'
    const diff = Date.now() - ts
    if (diff < 60_000) return 'Synced just now'
    if (diff < 3_600_000) return `Synced ${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `Synced ${Math.floor(diff / 3_600_000)}h ago`
    return `Synced ${new Date(ts).toLocaleDateString()}`
  }

  return (
    <div className="flex h-6 items-center justify-between border-t border-gray-800 bg-gray-900 px-4 text-xs text-gray-500">
      {/* Left: item count + selection */}
      <div className="flex items-center gap-3">
        <span>
          {fileCount} {fileCount === 1 ? 'item' : 'items'}
          {selectedCount > 0 && (
            <span className="text-violet-400"> · {selectedCount} selected</span>
          )}
        </span>
      </div>

      {/* Center: sync status */}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1">
          {status?.lastPushStatus === 'success' ? (
            <Cloud className="h-3 w-3 text-teal-500" />
          ) : (
            <CloudOff className="h-3 w-3 text-gray-600" />
          )}
          {formatSyncTime(status?.lastPush)}
        </span>
        <button
          className={clsx(
            'flex items-center gap-1 text-gray-600 hover:text-gray-300 transition-colors',
            isSyncing && 'animate-pulse text-violet-400'
          )}
          onClick={() => {
            push().catch(console.error)
            pull().catch(console.error)
          }}
          disabled={isSyncing}
        >
          <RefreshCw className={clsx('h-3 w-3', isSyncing && 'animate-spin')} />
        </button>
      </div>

      {/* Right: storage + version */}
      <div className="flex items-center gap-3">
        <span className="text-gray-600">
          {formatBytes(storageUsed)}{' '}
          <span className="text-gray-700">/</span>{' '}
          {STORAGE_LIMIT_LABEL}
        </span>
        <span className="text-gray-600">v{version}</span>
      </div>
    </div>
  )
}
