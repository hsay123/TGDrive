import { useEffect, useRef, useState, useCallback } from 'react'
import clsx from 'clsx'
import {
  X,
  UploadCloud,
  Check,
  Loader2,
  Zap,
  FolderOpen,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  File,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useUploadStore, type UploadItem } from '../../store/upload.store'
import { useDownloadStore } from '../../store/download.store'
import { useFilesStore } from '../../store/files.store'
import { formatFileSize } from '../../lib/utils'
import toast from 'react-hot-toast'

// ── File-system entry reading (same pattern as DropZone) ─────────────────────

interface FSEntryLike {
  isFile: boolean
  isDirectory: boolean
  name: string
  file: (cb: (f: File) => void) => void
  createReader: () => { readEntries: (cb: (entries: FSEntryLike[]) => void) => void }
}

async function readEntry(
  entry: FSEntryLike
): Promise<Array<{ name: string; localPath: string; size: number }>> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      entry.file((file) => {
        const path = (file as File & { path?: string }).path
        path ? resolve([{ name: file.name, localPath: path, size: file.size }]) : resolve([])
      })
    })
  }
  if (entry.isDirectory) {
    const reader = entry.createReader()
    const all: FSEntryLike[] = []
    await new Promise<void>((resolve) => {
      const read = () =>
        reader.readEntries(async (entries) => {
          if (!entries.length) resolve()
          else { all.push(...entries); read() }
        })
      read()
    })
    const results: Array<{ name: string; localPath: string; size: number }> = []
    for (const child of all) results.push(...(await readEntry(child)))
    return results
  }
  return []
}

// ── Speed / ETA hook ─────────────────────────────────────────────────────────

interface Sample { bytes: number; time: number }
const SAMPLE_WINDOW = 5

function useUploadSpeed(item: UploadItem) {
  const [speed, setSpeed] = useState(0)
  const [bytesUploaded, setBytesUploaded] = useState(0)
  const [eta, setEta] = useState<number | null>(null)
  const samplesRef = useRef<Sample[]>([])
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (item.status !== 'uploading') return
    const now = Date.now()
    const bytes = (item.progress / 100) * item.size
    setBytesUploaded(bytes)
    if (startRef.current === 0) { startRef.current = now; return }
    const samples = samplesRef.current
    samples.push({ bytes, time: now })
    if (samples.length > SAMPLE_WINDOW) samples.shift()
    if (samples.length < 2) return
    const oldest = samples[0]; const newest = samples[samples.length - 1]
    const elapsedSec = (newest.time - oldest.time) / 1000
    if (elapsedSec < 0.5) return
    const instantSpeed = (newest.bytes - oldest.bytes) / elapsedSec
    if (instantSpeed <= 0) return
    setSpeed(instantSpeed)
    setEta((item.size - bytes) / instantSpeed)
  }, [item.progress, item.size, item.status])

  useEffect(() => {
    if (item.status !== 'uploading') {
      setSpeed(0); setBytesUploaded(0); setEta(null)
      samplesRef.current = []; startRef.current = 0
    }
  }, [item.status])

  return { speed, bytesUploaded, eta }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`
}

function friendlyError(error: string): string {
  if (error.includes('Channel not initialized')) return 'Setting up storage… retry in a few seconds.'
  if (error.includes('CHANNELS_TOO_MUCH')) return 'Telegram channel limit reached.'
  if (error.includes('FLOOD_WAIT')) return 'Rate-limited by Telegram. Please wait.'
  return error
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return <Image size={14} className="text-sky-400/80" />
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return <Film size={14} className="text-pink-400/80" />
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return <Music size={14} className="text-amber-400/80" />
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <Archive size={14} className="text-orange-400/80" />
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return <FileText size={14} className="text-violet-400/80" />
  return <File size={14} className="text-gray-400/70" />
}

// ── Upload item row ───────────────────────────────────────────────────────────

function UploadRow({ item }: { item: UploadItem }) {
  const { speed, bytesUploaded, eta } = useUploadSpeed(item)
  const isUploading = item.status === 'uploading'
  const isActive = item.status === 'uploading' || item.status === 'queued'
  const isCancelled = item.status === 'cancelled'
  const isDone = item.status === 'done'
  const isError = item.status === 'error'

  const handleCancel = async () => {
    await window.televault.files.cancelUpload(item.id)
    useUploadStore.getState().markCancelled(item.id)
  }

  return (
    <div
      className={clsx(
        'px-3 py-2.5 transition-all duration-200',
        isDone && 'opacity-70'
      )}
    >
      {/* Top row: icon + name + status controls */}
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-white/[0.04] border border-white/[0.06]">
          {getFileIcon(item.name)}
        </div>

        <span
          className={clsx(
            'flex-1 min-w-0 truncate text-[12px] leading-snug',
            isCancelled ? 'line-through text-white/25' : isDone ? 'text-white/50' : 'text-white/80'
          )}
          title={item.name}
        >
          {item.name}
        </span>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isDone && (
            <div className="w-4 h-4 rounded-full bg-teal-500/20 flex items-center justify-center">
              <Check size={9} className="text-teal-400" />
            </div>
          )}
          {isError && (
            <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <X size={9} className="text-red-400" />
            </div>
          )}
          {isUploading && <Loader2 size={11} className="text-violet-400 animate-spin" />}
          {isActive && (
            <button
              onClick={handleCancel}
              className="w-4 h-4 rounded flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors ml-0.5"
              title="Cancel"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(isUploading || item.status === 'queued') && (
        <div className="mt-1.5 ml-8">
          {/* Track */}
          <div className="w-full h-[3px] rounded-full bg-black/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-300 ease-out relative overflow-hidden"
              style={{ width: `${item.progress}%` }}
            >
              {/* Shimmer */}
              {isUploading && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom row: size / speed / ETA / error */}
      <div className="flex items-center justify-between mt-1 ml-8 text-[10px] text-white/30">
        <span>
          {isUploading && bytesUploaded > 0
            ? `${formatBytes(bytesUploaded)} / ${formatBytes(item.size)}`
            : formatFileSize(item.size)}
        </span>
        {isError ? (
          <span className="text-red-400/80 truncate max-w-[150px]" title={item.error ?? ''}>
            {friendlyError(item.error ?? 'Upload failed')}
          </span>
        ) : isUploading && speed > 0 ? (
          <span className="flex items-center gap-0.5 text-violet-300/80">
            <Zap size={8} />
            {formatBytes(speed)}/s
            {eta !== null && <span className="text-white/25 ml-0.5">· {formatETA(eta)}</span>}
          </span>
        ) : (
          <span>{Math.round(item.progress)}%</span>
        )}
      </div>
    </div>
  )
}

// ── Inner dropzone (shown when queue is empty) ────────────────────────────────

function InlineDropzone({
  onBrowse,
  isDraggingIn,
}: {
  onBrowse: () => void
  isDraggingIn: boolean
}) {
  return (
    <button
      onClick={onBrowse}
      className={clsx(
        'w-full mx-3 mb-3 mt-1 rounded-[16px] border border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-2.5 py-7 cursor-pointer',
        isDraggingIn
          ? 'border-violet-500/60 bg-violet-500/10'
          : 'border-white/[0.12] bg-white/[0.02] hover:border-violet-500/40 hover:bg-violet-500/[0.05]'
      )}
      style={{ width: 'calc(100% - 1.5rem)' }}
    >
      <div
        className={clsx(
          'w-10 h-10 rounded-[12px] flex items-center justify-center transition-all duration-200',
          isDraggingIn
            ? 'bg-violet-500/20 border border-violet-500/30'
            : 'bg-white/[0.05] border border-white/[0.08]'
        )}
      >
        <UploadCloud
          size={20}
          className={clsx(
            'transition-colors duration-200',
            isDraggingIn ? 'text-violet-400' : 'text-white/40'
          )}
        />
      </div>
      <div className="text-center">
        <p className="text-[12px] font-medium text-white/50">Drag & drop files here</p>
        <p className="text-[10px] text-white/25 mt-0.5">or click to browse</p>
      </div>
    </button>
  )
}

// ── Main FloatingUploadCard ───────────────────────────────────────────────────

export function FloatingUploadCard() {
  const { queue, isVisible, setVisible, clearDone, addToQueue } = useUploadStore()
  const downloadActive = useDownloadStore((s) => s.isVisible && s.queue.length > 0)
  const currentPath = useFilesStore((s) => s.currentPath)

  const [minimized, setMinimized] = useState(false)
  const [isDraggingIn, setIsDraggingIn] = useState(false)
  const dragCounter = useRef(0)

  const activeItems = queue.filter((q) => q.status === 'queued' || q.status === 'uploading')
  const activeCount = activeItems.length
  const overallProgress =
    queue.length > 0
      ? Math.round(queue.reduce((sum, q) => sum + q.progress, 0) / queue.length)
      : 0

  const showDropzone = queue.length === 0

  // ── Drag-over detection for the card's inner dropzone ──
  const handleCardDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current += 1
    setIsDraggingIn(true)
  }, [])

  const handleCardDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDraggingIn(false) }
  }, [])

  const handleCardDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
  }, [])

  const handleCardDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragCounter.current = 0; setIsDraggingIn(false)
    const items = e.dataTransfer?.items
    if (!items) return
    const filesToUpload: Array<{ name: string; localPath: string; size: number }> = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.() as FSEntryLike | null
        if (entry) {
          filesToUpload.push(...(await readEntry(entry)))
        } else {
          const file = item.getAsFile()
          if (file) {
            const path = (file as File & { path?: string }).path
            if (path) filesToUpload.push({ name: file.name, localPath: path, size: file.size })
          }
        }
      }
    }
    if (filesToUpload.length > 0) addToQueue(filesToUpload, currentPath, false)
  }, [addToQueue, currentPath])

  // ── Native file picker ──
  const handleBrowse = useCallback(async () => {
    const result = await window.televault.system.openFilePicker()
    if (!result.success || !result.data?.length) {
      if (result.error) toast.error(result.error)
      return
    }
    addToQueue(
      result.data.map((f) => ({
        name: f.path.split('/').pop() ?? f.path,
        localPath: f.path,
        size: f.size,
      })),
      currentPath,
      false
    )
  }, [addToQueue, currentPath])

  // ── Minimized pill ──
  if (isVisible && minimized) {
    return (
      <div
        className={clsx(
          'fixed right-8 z-[100] transition-all duration-300 ease-in-out',
          downloadActive ? 'bottom-[330px]' : 'bottom-8'
        )}
      >
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-3 rounded-full px-4 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
          style={{
            background: 'linear-gradient(135deg, rgba(26,26,29,0.85) 0%, rgba(15,15,17,0.75) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          {activeCount > 0 ? (
            <Loader2 size={14} className="text-violet-400 animate-spin flex-shrink-0" />
          ) : (
            <Check size={14} className="text-teal-400 flex-shrink-0" />
          )}
          <span className="text-[13px] font-medium text-white/70">
            {activeCount > 0
              ? `${activeCount} upload${activeCount !== 1 ? 's' : ''}…`
              : 'Uploads complete'}
          </span>
          <span className="text-[11px] text-white/30">{overallProgress}%</span>
          <ChevronUp size={12} className="text-white/30 ml-0.5" />
        </button>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'fixed right-8 z-[100] w-[360px] transition-all duration-300 ease-in-out',
        downloadActive ? 'bottom-[330px]' : 'bottom-8',
        isVisible
          ? 'opacity-100 translate-y-0 scale-100'
          : 'opacity-0 translate-y-3 scale-[0.98] pointer-events-none'
      )}
      onDragEnter={handleCardDragEnter}
      onDragLeave={handleCardDragLeave}
      onDragOver={handleCardDragOver}
      onDrop={handleCardDrop}
    >
      {/* Glass card */}
      <div
        className="rounded-[28px] overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(26,26,29,0.62) 0%, rgba(15,15,17,0.42) 100%)',
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
          border: '1px solid',
          borderColor: 'rgba(255,255,255,0.08)',
          borderTopColor: 'rgba(255,255,255,0.15)',
          borderLeftColor: 'rgba(255,255,255,0.09)',
          borderRightColor: 'rgba(0,0,0,0.22)',
          borderBottomColor: 'rgba(0,0,0,0.42)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.52), 0 1px 0 rgba(255,255,255,0.06) inset',
        }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            {/* Glowing icon — click to open file picker */}
            <button
              onClick={handleBrowse}
              className="w-7 h-7 rounded-[10px] flex items-center justify-center bg-violet-500/15 border border-violet-500/20 shadow-[0_0_10px_rgba(124,58,237,0.25)] hover:bg-violet-500/25 hover:shadow-[0_0_16px_rgba(124,58,237,0.4)] transition-all duration-150"
              title="Open file picker"
            >
              <UploadCloud size={14} className="text-violet-400" />
            </button>
            <div>
              <p className="text-[13px] font-semibold text-white/90 leading-none">Upload Files</p>
              {activeCount > 0 && (
                <p className="text-[10px] text-white/35 mt-0.5 leading-none">
                  {activeCount} active · {overallProgress}%
                </p>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            {queue.length > 0 && (
              <button
                onClick={clearDone}
                className="text-[10px] text-white/25 hover:text-white/50 px-2 py-1 rounded-lg hover:bg-white/[0.05] transition-all"
              >
                Clear done
              </button>
            )}
            {queue.length > 0 && (
              <button
                onClick={() => setMinimized(true)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/[0.05] transition-all"
                title="Minimize"
              >
                <ChevronDown size={12} />
              </button>
            )}
            <button
              onClick={() => setVisible(false)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/[0.05] transition-all"
              title="Close"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent mx-3" />

        {/* ── Content ── */}
        <div className="pt-3">
          {/* Dropzone (shown when no uploads are queued) */}
          {showDropzone && (
            <InlineDropzone
              onBrowse={handleBrowse}
              isDraggingIn={isDraggingIn}
            />
          )}

          {/* Upload queue list */}
          {!showDropzone && (
            <>
              <div className="max-h-[280px] overflow-y-auto overflow-x-hidden divide-y divide-white/[0.05] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {queue.map((item) => (
                  <UploadRow key={item.id} item={item} />
                ))}
              </div>

              {/* Browse more button at bottom */}
              <div className="px-3 pb-3 pt-2.5">
                <button
                  onClick={handleBrowse}
                  className="w-full flex items-center justify-center gap-2 rounded-[14px] py-2 text-[11px] font-medium text-white/35 hover:text-white/60 border border-dashed border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.03] transition-all duration-150"
                >
                  <FolderOpen size={12} />
                  Add more files
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
