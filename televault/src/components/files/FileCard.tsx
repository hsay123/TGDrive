import { useRef } from 'react'
import clsx from 'clsx'
import { Folder, Lock, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import type { VFSEntry } from '../../types'
import { FileIcon } from './FileIcon'
import { toThumbnailUrl } from '../../lib/tvfile'
import { useFilesStore } from '../../store/files.store'
//file thumbnail card
interface FileCardProps {
  entry: VFSEntry
  selected: boolean
  onSelect: (multi: boolean, shift: boolean) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function FileCard({
  entry,
  selected,
  onSelect,
  onDoubleClick,
  onContextMenu,
}: FileCardProps) {
  const isFolder = entry.type === 'folder'
  const thumbnailUrl =
    entry.type === 'file' ? toThumbnailUrl(entry.thumbnailPath) : null
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
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={entry.name}
            draggable="false"
            className="h-full w-full object-cover rounded-xl shadow-lg border border-white/10"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center rounded-xl bg-black/[0.06] dark:bg-black/20 border border-black/[0.06] dark:border-white/5 shadow-inner">
            <FileIcon mime={entry.mimeType} size="lg" />
          </div>
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
