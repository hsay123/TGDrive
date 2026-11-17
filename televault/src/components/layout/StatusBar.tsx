import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useSync } from '../../hooks/useSync'
import { useFilesStore } from '../../store/files.store'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { STORAGE_LIMIT_LABEL } from '../../utils/constants'
import { useUpdate } from '../../hooks/useUpdate'
import type { UpdateState } from '../../hooks/useUpdate'

function updateLabel(update: UpdateState, currentVersion: string): string {
  switch (update.phase) {
    case 'checking':
      return 'Checking…'
    case 'available':
      return `v${update.version} available`
    case 'downloading':
      return `Downloading ${update.percent ?? 0}%`
    case 'downloaded':
      return 'Restart to update'
    default:
      return `v${currentVersion}`
  }
}

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
  const update = useUpdate()

  // One button, four behaviours, driven entirely by the updater phase.
  const handleUpdateClick = () => {
    switch (update.phase) {
      case 'available':
        update.download()
        break
      case 'downloaded':
        update.install()
        break
      case 'downloading':
        break
      default:
        update.check()
    }
  }

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
    <div
      className="relative z-10 flex h-7 items-center justify-between px-5 text-xs backdrop-blur-md"
      style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', color: 'var(--muted)' }}
    >
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
        <button
          className={clsx(
            'transition-colors',
            update.phase === 'available' && 'text-violet-400 hover:text-violet-300',
            update.phase === 'downloaded' && 'text-teal-400 hover:text-teal-300',
            update.phase === 'downloading' && 'text-violet-400',
            (update.phase === 'idle' || update.phase === 'not-available' || update.phase === 'error') &&
              'text-gray-600 hover:text-gray-400'
          )}
          onClick={handleUpdateClick}
          disabled={update.phase === 'checking' || update.phase === 'downloading'}
          title={
            update.phase === 'available'
              ? `Version ${update.version} is available — click to download`
              : update.phase === 'error'
                ? (update.message ?? 'Update check failed')
                : 'Check for updates'
          }
        >
          {updateLabel(update, version)}
        </button>
      </div>
    </div>
  )
}
