import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, Check, X, Loader2, Upload } from 'lucide-react'
import { useUploadStore } from '../../store/upload.store'
import { ProgressBar } from './ProgressBar'
import { formatFileSize } from '../../lib/utils'

const statusColors = {
  queued: 'text-gray-500',
  uploading: 'text-violet-400',
  done: 'text-teal-400',
  error: 'text-red-400',
}

const statusLabels = {
  queued: 'Queued',
  uploading: 'Uploading',
  done: 'Done',
  error: 'Failed',
}

function friendlyErrorMessage(error: string): string {
  if (error.includes('Channel not initialized')) {
    return 'Setting up your TeleVault storage… please try again in a few seconds.'
  }
  if (error.includes('CHANNELS_TOO_MUCH')) {
    return 'Telegram channel limit reached. Please leave some channels and try again.'
  }
  if (error.includes('FLOOD_WAIT')) {
    return 'Telegram is rate-limiting requests. Please wait a moment and try again.'
  }
  if (error.includes('Failed to initialize Telegram channels')) {
    return 'Could not create storage channels on Telegram. Check your internet connection and try again.'
  }
  return error
}

export function UploadQueue() {
  const queue = useUploadStore((s) => s.queue)
  const clearDone = useUploadStore((s) => s.clearDone)
  const [minimized, setMinimized] = useState(false)
  const [visible, setVisible] = useState(false)

  const activeCount = queue.filter(
    (q) => q.status === 'queued' || q.status === 'uploading'
  ).length

  const overallProgress =
    queue.length > 0
      ? Math.round(queue.reduce((sum, q) => sum + q.progress, 0) / queue.length)
      : 0

  useEffect(() => {
    if (queue.length > 0) setVisible(true)
  }, [queue.length])

  useEffect(() => {
    if (queue.length === 0) return
    const allDone = queue.every((q) => q.status === 'done' || q.status === 'error')
    if (allDone) {
      const timer = setTimeout(() => {
        setVisible(false)
        clearDone()
      }, 3500)
      return () => clearTimeout(timer)
    }
  }, [queue, clearDone])

  if (!visible || queue.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-30 w-80">
      {minimized ? (
        // Collapsed pill
        <button
          onClick={() => setMinimized(false)}
          className="flex w-full items-center gap-3 rounded-full border border-gray-700 bg-gray-800 px-4 py-2.5 shadow-xl hover:bg-gray-700 transition-colors"
        >
          {activeCount > 0 ? (
            <Loader2 className="h-4 w-4 text-violet-400 animate-spin flex-shrink-0" />
          ) : (
            <Check className="h-4 w-4 text-teal-400 flex-shrink-0" />
          )}
          <span className="flex-1 text-sm font-medium text-gray-200">
            {activeCount > 0
              ? `${activeCount} upload${activeCount !== 1 ? 's' : ''}…`
              : 'Upload complete'}
          </span>
          <div className="text-xs text-gray-500">{overallProgress}%</div>
          <Upload className="h-3.5 w-3.5 text-gray-500" />
        </button>
      ) : (
        // Expanded panel
        <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <span className="text-sm font-semibold text-gray-100">
              {activeCount > 0
                ? `Uploading ${activeCount} file${activeCount !== 1 ? 's' : ''}`
                : 'Uploads'}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="rounded px-2 py-1 text-xs text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                onClick={() => clearDone()}
              >
                Clear done
              </button>
              <button
                className="rounded p-1.5 text-gray-400 hover:bg-gray-700 transition-colors"
                onClick={() => setMinimized(true)}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Items list */}
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-700/50">
            {queue.map((item) => (
              <div key={item.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-200">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={clsx('text-xs', statusColors[item.status])}>
                      {statusLabels[item.status]}
                    </span>
                    {item.status === 'uploading' && (
                      <Loader2 className="h-3.5 w-3.5 text-violet-400 animate-spin" />
                    )}
                    {item.status === 'done' && (
                      <Check className="h-3.5 w-3.5 text-teal-400" />
                    )}
                    {item.status === 'error' && (
                      <X className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </div>
                </div>

                {(item.status === 'uploading' || item.status === 'queued') && (
                  <ProgressBar
                    percent={item.progress}
                    size="sm"
                    color="violet"
                    animated={item.status === 'uploading'}
                  />
                )}

                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>{formatFileSize(item.size)}</span>
                  {item.status === 'error' ? (
                    <span className="text-red-400 truncate max-w-[160px]" title={item.error ?? ''}>
                      {friendlyErrorMessage(item.error ?? 'Upload failed')}
                    </span>
                  ) : (
                    <span>{Math.round(item.progress)}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
