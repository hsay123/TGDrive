import { useRef, useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { Folder, Lock, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import type { VFSEntry } from '../../types'
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

export function FileCard({
  entry,
  selected,
  onSelect,
  onDoubleClick,
  onContextMenu,
}: FileCardProps) {
  const isFolder = entry.type === 'folder'
  const isVideo = entry.type === 'file' && entry.mimeType?.startsWith('video/')

  // ── Video thumbnail state ──────────────────────────────────────────────────
  const [videoThumb, setVideoThumb] = useState<string | null>(null)
  const [thumbState, setThumbState] = useState<'idle' | 'loading' | 'done' | 'failed'>('idle')
  const cardRef = useRef<HTMLDivElement>(null)
  const visibleRef = useRef(false)
  const thumbStateRef = useRef(thumbState)
  thumbStateRef.current = thumbState

  // Reset when the card slot shows a different file
  useEffect(() => {
    setVideoThumb(null)
    setThumbState('idle')
  }, [entry.id])

  const generateThumb = useCallback(async () => {
    if (!isVideo) return
    if (entry.thumbnailPath) return
    if (thumbStateRef.current !== 'idle') return

    setThumbState('loading')
    let released = false

    try {
      await acquireThumbSlot()

      // Double-check state after waiting in queue (card may have unmounted / file changed)
      if (thumbStateRef.current !== 'loading') {
        releaseThumbSlot()
        released = true
        return
      }

      // ── Fast path: download ONLY the first chunk ─────────────────────────
      const partialResult = await window.televault.files.downloadFirstChunkToTemp(entry.id)
      if (!partialResult.success || !partialResult.data) {
        setThumbState('failed')
        return
      }

      const filename = partialResult.data.split(/[/\\]/).pop()
      if (!filename) { setThumbState('failed'); return }

      const videoUrl = `tvfile://preview-cache/${filename}`
      const dataUrl = await extractVideoFrame(videoUrl, 1.5)

      if (!dataUrl) { setThumbState('failed'); return }

      setVideoThumb(dataUrl)
      setThumbState('done')

      // Persist thumbnail to disk (non-blocking)
      window.televault.files.saveThumbnail(entry.id, dataUrl)
        .catch((e) => console.error('[FileCard] saveThumbnail:', e))

    } catch (err) {
      console.error('[FileCard] thumb generation failed:', err)
      setThumbState('failed')
    } finally {
      if (!released) releaseThumbSlot()
    }
  }, [entry.id, entry.thumbnailPath, isVideo])

  // Trigger generation only when the card becomes visible
  useEffect(() => {
    if (!isVideo || entry.thumbnailPath) return

    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visibleRef.current) {
          visibleRef.current = true
          generateThumb()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isVideo, entry.thumbnailPath, generateThumb])

  // Allow the "Generate Thumbnail" context-menu action to force a retry
  useEffect(() => {
    function onRegenerate(e: Event) {
      const ev = e as CustomEvent<{ fileId: string }>
      if (ev.detail.fileId === entry.id) {
        setVideoThumb(null)
        visibleRef.current = false
        setThumbState('idle')
      }
    }
    window.addEventListener('televault:regenerate-thumb', onRegenerate)
    return () => window.removeEventListener('televault:regenerate-thumb', onRegenerate)
  }, [entry.id])

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
}

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
