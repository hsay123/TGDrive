import { useRef, useState, useEffect, useCallback, memo } from 'react'
import clsx from 'clsx'
import { Folder, Lock, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import type { VFSEntry, VFSFile } from '../../types'
import { FileIcon } from './FileIcon'
import { toThumbnailUrl } from '../../lib/tvfile'
import { useFilesStore } from '../../store/files.store'
import { extractVideoFrame } from '../../utils/videoThumbnail'

//file thumbnail card
interface FileCardProps {
  entry: VFSEntry
  selected: boolean
  onSelect: (multi: boolean, shift: boolean) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

// ── Global concurrency guard: only 1 thumbnail downloads at a time ──────────
let thumbGenActive = 0
const THUMB_CONCURRENCY = 1
const thumbQueue: Array<() => void> = []

// ── Safety net: bound the download stage so the spinner can never hang ──────
// The main process also enforces this bound (files:downloadFirstChunkToTemp),
// but even if that fix were imperfect, this guarantees generateThumb() always
// transitions out of 'loading' within a bounded time.
const THUMB_DOWNLOAD_TIMEOUT_MS = 15000
const THUMB_DOWNLOAD_TIMEOUT_CAP_MS = 60000

// Single-chunk files download in their ENTIRETY for the thumbnail (the chunk
// IS the whole file), so a fixed 15s budget fails on slow connections for large
// files. Scale the budget by file size (~6s/MiB), floored at 15s, capped at 60s.
function thumbDownloadTimeoutFor(sizeBytes: number): number {
  const sizeMB = sizeBytes / (1024 * 1024)
  return Math.min(
    THUMB_DOWNLOAD_TIMEOUT_CAP_MS,
    Math.max(THUMB_DOWNLOAD_TIMEOUT_MS, Math.ceil(sizeMB) * 6000)
  )
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  stage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`thumb-${stage}-timeout (${ms}ms)`)),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}
// ────────────────────────────────────────────────────────────────────────────

function acquireThumbSlot(): Promise<void> {
  if (thumbGenActive < THUMB_CONCURRENCY) {
    thumbGenActive++
    return Promise.resolve()
  }
  return new Promise((resolve) => thumbQueue.push(resolve))
}

function releaseThumbSlot(): void {
  const next = thumbQueue.shift()
  if (next) {
    next()
  } else {
    thumbGenActive--
  }
}
// ────────────────────────────────────────────────────────────────────────────

// Memoized: a selection change only re-renders cards whose `selected` actually
// flips, instead of re-rendering the whole grid. Phase 1 measured ~150-600 card
// re-renders (~10-26ms) per single click — see PERF-P1-PHASE.md §4.
//
// The comparator deliberately ignores the callback props: they change identity
// every render, but only close over the stable row `entry` plus stable store
// actions, so an ignored (stale) closure stays functionally correct — any card
// whose selected state changed DID re-render and receives fresh closures.
//
// It compares the mutable entry fields (not object identity) so a refreshed
// entries array that leaves a given file unchanged does NOT force a re-render.
const fileCardComparator = (prev: FileCardProps, next: FileCardProps): boolean => {
  if (prev.selected !== next.selected) return false
  if (prev.entry.id !== next.entry.id) return false
  if (prev.entry.type !== next.entry.type) return false
  if (prev.entry.name !== next.entry.name) return false
  if (prev.entry.path !== next.entry.path) return false
  if (prev.entry.updatedAt !== next.entry.updatedAt) return false
  if (prev.entry.type === 'folder' || next.entry.type === 'folder') return true
  const a = prev.entry as VFSFile
  const b = next.entry as VFSFile
  return (
    a.size === b.size &&
    a.mimeType === b.mimeType &&
    a.folderId === b.folderId &&
    a.uploadedAt === b.uploadedAt &&
    a.thumbnailPath === b.thumbnailPath &&
    a.starred === b.starred
  )
}

type ThumbState = 'idle' | 'loading' | 'done' | 'failed'

// memo() comparator above assumes VFSFile/VFSFolder come from src/types.
export const FileCard = memo(
  function FileCard({
  entry,
  selected,
  onSelect,
  onDoubleClick,
  onContextMenu,
}: FileCardProps) {
  const isFolder = entry.type === 'folder'
  const isVideo = entry.type === 'file' && entry.mimeType?.startsWith('video/')
  // thumbnailPath only exists on VFSFile — narrow once here so the rest of the
  // component does not have to re-check entry.type at every use site.
  const thumbnailPath = entry.type === 'file' ? entry.thumbnailPath : null

  // ── Video thumbnail state ──────────────────────────────────────────────────
  const [videoThumb, setVideoThumb] = useState<string | null>(null)
  const [thumbState, setThumbState] = useState<ThumbState>('idle')
  const cardRef = useRef<HTMLDivElement>(null)
  const visibleRef = useRef(false)
  const thumbStateRef = useRef<ThumbState>(thumbState)
  thumbStateRef.current = thumbState

  // Read through a function so TS control-flow narrowing does not freeze the
  // ref at 'idle': the ref is re-synced by the render that setThumbState
  // schedules, which happens inside the await below and is invisible to TS.
  const readThumbState = (): ThumbState => thumbStateRef.current

  // Reset when the card slot shows a different file
  useEffect(() => {
    setVideoThumb(null)
    setThumbState('idle')
  }, [entry.id])

  const generateThumb = useCallback(async () => {
    if (!isVideo) return
    if (thumbnailPath) return
    if (readThumbState() !== 'idle') return

    setThumbState('loading')
    let released = false

    try {
      await acquireThumbSlot()

      // Double-check state after waiting in queue (card may have unmounted / file changed)
      if (readThumbState() !== 'loading') {
        releaseThumbSlot()
        released = true
        return
      }

      // ── Fast path: download ONLY the first chunk (bounded by UI timeout) ──
      const partialResult = await withTimeout(
        window.televault.files.downloadFirstChunkToTemp(entry.id),
        thumbDownloadTimeoutFor(entry.size),
        'download'
      )
      if (!partialResult.success || !partialResult.data) {
        const errorMsg = partialResult.error ?? 'unknown error'
        const stage = /timeout/i.test(errorMsg)
          ? 'download-timeout'
          : /decrypt/i.test(errorMsg)
            ? 'decrypt-failed'
            : 'download-failed'
        console.error(`[FileCard] thumb ${stage}: ${errorMsg}`)
        setThumbState('failed')
        return
      }

      const filename = partialResult.data.split(/[/\\]/).pop()
      if (!filename) {
        console.error('[FileCard] thumb download-failed: no filename from cached path')
        setThumbState('failed')
        return
      }

      const videoUrl = `tvfile://preview-cache/${filename}`
      const dataUrl = await extractVideoFrame(videoUrl, 1.5)

      if (!dataUrl) {
        console.error('[FileCard] thumb decode-failed: frame extraction returned null')
        setThumbState('failed')
        return
      }

      setVideoThumb(dataUrl)
      setThumbState('done')

      // Persist thumbnail to disk (non-blocking)
      window.televault.files.saveThumbnail(entry.id, dataUrl)
        .catch((e) => console.error('[FileCard] saveThumbnail:', e))

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stage = /timeout/i.test(message) ? 'download-timeout' : 'download-failed'
      console.error(`[FileCard] thumb ${stage}:`, err)
      setThumbState('failed')
    } finally {
      if (!released) releaseThumbSlot()
    }
  }, [entry.id, thumbnailPath, isVideo])

  // Trigger generation only when the card becomes visible
  useEffect(() => {
    if (!isVideo || thumbnailPath) return

    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visibleRef.current) {
          visibleRef.current = true
          generateThumb()
        }
      },
      // Preload buffer: start generating a frame 100px before the card scrolls
      // into view, so by the time it's visible the thumbnail is usually ready.
      { threshold: 0.1, rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isVideo, thumbnailPath, generateThumb])

  // Allow the "Generate Thumbnail" context-menu action to force a retry
  useEffect(() => {
    function onRegenerate(e: Event) {
      const ev = e as CustomEvent<{ fileId: string }>
      if (ev.detail.fileId === entry.id) {
        setVideoThumb(null)
        visibleRef.current = false
        thumbStateRef.current = 'idle'
        setThumbState('idle')
        // The IntersectionObserver won't re-fire for an already-visible card,
        // so invoke the generation pipeline directly to actually retry.
        generateThumb()
      }
    }
    window.addEventListener('televault:regenerate-thumb', onRegenerate)
    return () => window.removeEventListener('televault:regenerate-thumb', onRegenerate)
  }, [entry.id, generateThumb])

  const isStarred = entry.type === 'file' && (entry as any).starred === 1

  const renamingId = useFilesStore((s) => s.renamingId)
  const setRenamingId = useFilesStore((s) => s.setRenamingId)
  const refreshFolder = useFilesStore((s) => s.refreshFolder)
  const isRenaming = renamingId === entry.id

  const inputRef = useRef<HTMLInputElement>(null)

  async function handleRename(newName: string) {
    setRenamingId(null)
    const trimmed = newName.trim()
    if (!trimmed || trimmed === entry.name) return
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      toast.error('Name cannot contain / or \\')
      return
    }
    try {
      if (entry.type === 'file') {
        const result = await window.televault.files.rename(entry.id, trimmed)
        if (!result.success) throw new Error(result.error)
      } else {
        const result = await window.televault.folders.rename(entry.id, trimmed)
        if (!result.success) throw new Error(result.error)
      }
      toast.success('Renamed successfully')
      await refreshFolder()
    } catch (err) {
      toast.error(`Rename failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div
      ref={cardRef}
      className={clsx(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-[20px] transition-all duration-200 ease-in-out border select-none outline-none',
        selected
          ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
          : 'border-transparent bg-black/[0.04] dark:bg-white/5 hover:bg-black/[0.07] dark:hover:bg-white/[0.08] hover:border-black/[0.08] dark:hover:border-white/10 backdrop-blur-md'
      )}
      onClick={(e) => !isRenaming && onSelect(e.metaKey || e.ctrlKey, e.shiftKey)}
      onDoubleClick={() => !isRenaming && onDoubleClick()}
      onContextMenu={onContextMenu}
    >
      {/* Star indicator */}
      {isStarred && (
        <Star
          size={14}
          className="absolute top-2.5 right-2.5 z-10 fill-yellow-400 text-yellow-400 drop-shadow-md"
        />
      )}

      {/* Preview area - fixed aspect ratio (squareish) */}
      <div className="relative flex aspect-square w-full items-center justify-center p-3">
        {isFolder ? (
          <Folder className="h-16 w-16 text-violet-400" />
        ) : (
          (() => {
            // 1. DB-cached thumbnail (images + previously generated video thumbs)
            const cachedThumb = toThumbnailUrl(entry.type === 'file' ? entry.thumbnailPath : null)
            if (cachedThumb) {
              return (
                <div className="relative h-full w-full overflow-hidden rounded-xl shadow-lg border border-white/10">
                  <img
                    src={cachedThumb}
                    alt={entry.name}
                    draggable="false"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                  {isVideo && <VideoPlayBadge />}
                </div>
              )
            }

            // 2. Freshly generated video thumbnail (in-memory, not yet saved)
            if (isVideo && videoThumb) {
              return (
                <div className="relative h-full w-full overflow-hidden rounded-xl shadow-lg border border-white/10">
                  <img
                    src={videoThumb}
                    alt={entry.name}
                    draggable="false"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <VideoPlayBadge />
                </div>
              )
            }

            // 3. Video thumbnail generating — spinner
            if (isVideo && thumbState === 'loading') {
              return (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-black/[0.06] dark:bg-black/20 border border-black/[0.06] dark:border-white/5 shadow-inner">
                  <div className="h-7 w-7 rounded-full border-[2.5px] border-white/10 border-t-[#5e5ce6] animate-spin" />
                </div>
              )
            }

            // 4. Fallback — generic file icon
            return (
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-black/[0.06] dark:bg-black/20 border border-black/[0.06] dark:border-white/5 shadow-inner">
                <FileIcon mime={entry.type === 'file' ? entry.mimeType : undefined} size="lg" />
              </div>
            )
          })()
        )}
      </div>

      {/* Footer / Filename */}
      <div className="px-3 pb-4 pt-1 text-center">
        {isRenaming ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={entry.name}
            className="w-full rounded-md border border-rose-400 bg-black/40 px-2 py-1 text-xs text-white outline-none text-center focus:ring-1 focus:ring-rose-500"
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => handleRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename(e.currentTarget.value)
              if (e.key === 'Escape') setRenamingId(null)
              e.stopPropagation()
            }}
            onFocus={(e) => e.target.select()}
          />
        ) : (
          <div className="flex flex-col items-center">
            <p className="w-full text-[13px] font-medium text-neutral-900 dark:text-gray-200 truncate">
              {entry.name}
            </p>
            {/* Optional secondary info like size or lock can go here if needed, but keeping it clean per requirements */}
            {entry.type === 'file' && (entry as any).isEncrypted && (
              <Lock className="mt-1 h-3 w-3 text-teal-400" />
            )}
          </div>
        )}
      </div>
    </div>
  )
},
fileCardComparator
)

function VideoPlayBadge() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.18)' }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.86)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderLeft: '9px solid #111',
            marginLeft: 2,
          }}
        />
      </div>
    </div>
  )
}
