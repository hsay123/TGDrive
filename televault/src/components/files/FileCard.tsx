import clsx from 'clsx'
import { Folder, Lock } from 'lucide-react'
import type { VFSEntry } from '../../types'
import { formatFileSize } from '../../lib/utils'
import { FileIcon } from './FileIcon'
import { toThumbnailUrl } from '../../lib/tvfile'

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

  return (
    <div
      className={clsx(
        'group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-gray-800 transition-all duration-150',
        selected
          ? 'border-violet-500 bg-violet-600/10 ring-1 ring-violet-500'
          : 'border-gray-700 hover:bg-gray-700 hover:border-gray-600'
      )}
      onClick={(e) => onSelect(e.metaKey || e.ctrlKey, e.shiftKey)}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
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
        {!isFolder && (
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
