import { useState } from 'react'
import clsx from 'clsx'
import { Download, Check, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useDownloadStore, type DownloadItem } from '../../store/download.store'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function DownloadItemRow({ item }: { item: DownloadItem }) {
  const isDownloading = item.status === 'downloading'

  return (
    <div className="px-4 py-3 space-y-2">
      {/* File name + icon */}
      <div className="flex items-center justify-between gap-2">
        <span className={clsx(
          'flex-1 min-w-0 truncate text-sm',
          item.status === 'done' ? 'text-gray-300' : 'text-gray-200'
        )}>
          {item.fileName}
        </span>
        <div className="flex-shrink-0">
          {isDownloading && <Loader2 className="h-3.5 w-3.5 text-teal-400 animate-spin" />}
          {item.status === 'done'  && <Check className="h-3.5 w-3.5 text-teal-400" />}
          {item.status === 'error' && <X     className="h-3.5 w-3.5 text-red-400" />}
        </div>
      </div>

      {/* Progress bar */}
      {isDownloading && (
        <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-teal-500 transition-all duration-300"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}

      {/* Bytes + speed  */}
      {isDownloading && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {formatBytes(item.downloaded)} / {formatBytes(item.size)}
          </span>
          <span className="text-teal-400 font-medium">
            {item.speed > 0 ? `${formatBytes(item.speed)}/s` : '—'}
          </span>
        </div>
      )}

      {/* Done */}
      {item.status === 'done' && (
        <p className="text-xs text-teal-400">
          Saved to {item.savedTo?.split('/').pop()}
        </p>
      )}

      {/* Error */}
      {item.status === 'error' && (
        <p className="text-xs text-red-400">{item.error ?? 'Download failed'}</p>
      )}
    </div>
  )
}

export function DownloadQueue() {
  const store = useDownloadStore()
  const { queue, clearCompleted, isVisible } = store
  const [expanded, setExpanded] = useState(true)

  const activeCount = queue.filter((i) => i.status === 'downloading').length
  const hasDone = queue.some((i) => i.status === 'done' || i.status === 'error')

  return (
    <div
      className={clsx(
        'fixed bottom-6 right-6 z-30 w-80 rounded-xl border border-gray-700 bg-gray-800 shadow-2xl overflow-hidden',
        'transition-all duration-300 ease-in-out',
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      )}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-semibold text-gray-100">
            {activeCount > 0
              ? `Downloading ${activeCount} file${activeCount !== 1 ? 's' : ''}`
              : 'Downloads'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasDone && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); clearCompleted() }}
              className="text-xs text-gray-500 hover:text-gray-200 transition-colors"
            >
              Clear done
            </span>
          )}
          {expanded
            ? <ChevronDown className="h-4 w-4 text-gray-500" />
            : <ChevronUp   className="h-4 w-4 text-gray-500" />}
        </div>
      </button>

      {/* Items */}
      {expanded && (
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-700/50">
          {queue.map((item) => (
            <DownloadItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
