import { useRef } from 'react'
import clsx from 'clsx'
import { Folder, Lock, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import type { VFSEntry } from '../../types'
import { formatFileSize } from '../../lib/utils'
import { FileIcon } from './FileIcon'
import { toThumbnailUrl } from '../../lib/tvfile'
import { useFilesStore } from '../../store/files.store'

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
  const mimeLabel = entry.type === 'file'
    ? (entry.mimeType?.split('/')[1]?.toUpperCase() ?? 'FILE')
    : null
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
        'group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-gray-800 transition-all duration-150',
        selected
          ? 'border-violet-500 bg-violet-600/10 ring-1 ring-violet-500'
          : 'border-gray-700 hover:bg-gray-700 hover:border-gray-600'
      )}
      onClick={(e) => !isRenaming && onSelect(e.metaKey || e.ctrlKey, e.shiftKey)}
      onDoubleClick={() => !isRenaming && onDoubleClick()}
      onContextMenu={onContextMenu}
    >
      {/* Star indicator */}
      {isStarred && (
        <Star
          size={13}
          className="absolute top-2 right-2 z-10 fill-yellow-400 text-yellow-400 drop-shadow"
        />
      )}

      {/* Preview area */}
      <div className="flex flex-1 items-center justify-center bg-gray-800/50 p-4 h-[100px]">
        {isFolder ? (
          <Folder className="h-14 w-14 text-violet-400" />
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={entry.name}
            className="h-full w-full object-cover rounded-md"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <FileIcon mime={entry.mimeType} size="lg" />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-700 px-2.5 py-2">
        {isRenaming ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={entry.name}
            className="w-full rounded border border-violet-500 bg-gray-900 px-1.5 py-0.5 text-sm text-gray-100 outline-none focus:ring-1 focus:ring-violet-500"
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
          <p
            className="text-sm font-medium text-gray-100 leading-tight"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {entry.name}
          </p>
        )}
        {!isFolder && !isRenaming && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <span>{formatFileSize(entry.size)}</span>
            {mimeLabel && (
              <>
                <span className="text-gray-700">·</span>
                <span>{mimeLabel}</span>
              </>
            )}
            {entry.isEncrypted && <Lock className="h-3 w-3 text-teal-500" />}
          </div>
        )}
      </div>
    </div>
  )
}
