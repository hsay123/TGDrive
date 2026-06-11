import clsx from 'clsx'
import { ChevronRight, Folder } from 'lucide-react'
import type { VFSFolder } from '../../types'
import { useTreeStore } from '../../store/tree.store'
import { useFilesStore } from '../../store/files.store'

interface FolderNodeProps {
  folder: VFSFolder
  depth: number
}

export function FolderNode({ folder, depth }: FolderNodeProps) {
  const expandedIds = useTreeStore((s) => s.expandedIds)
  const toggleExpand = useTreeStore((s) => s.toggleExpand)
  const currentPath = useFilesStore((s) => s.currentPath)
  const setPath = useFilesStore((s) => s.setPath)
  const isExpanded = expandedIds.has(folder.id)
  const isActive =
    currentPath === folder.path || currentPath.startsWith(`${folder.path}/`)
  const hasChildren = folder.children.length > 0

  if (folder.path === '/') return null

  return (
    <div>
      <button
        className={clsx(
          'flex w-full items-center gap-1 rounded-md py-1.5 pr-2 text-sm transition-colors duration-150',
          isActive
            ? 'bg-violet-600/20 text-violet-300 font-medium'
            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        onClick={() => {
          setPath(folder.path)
          if (hasChildren) toggleExpand(folder.id)
        }}
      >
        {/* Expand arrow */}
        <span
          className="flex h-4 w-4 items-center justify-center flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) toggleExpand(folder.id)
          }}
        >
          {hasChildren ? (
            <ChevronRight
              className={clsx(
                'h-3.5 w-3.5 text-gray-500 transition-transform duration-150',
                isExpanded && 'rotate-90'
              )}
            />
          ) : (
            <span className="w-3.5" />
          )}
        </span>

        {/* Folder icon */}
        <Folder
          className={clsx(
            'h-3.5 w-3.5 flex-shrink-0',
            isActive ? 'text-violet-400' : 'text-gray-500'
          )}
        />

        {/* Name */}
        <span className="flex-1 truncate text-left text-xs">{folder.name}</span>

        {/* File count badge */}
        {folder.fileCount > 0 && (
          <span className="flex-shrink-0 rounded-full bg-gray-800 px-1.5 text-[10px] text-gray-500">
            {folder.fileCount}
          </span>
        )}
      </button>

      {/* Children with height transition */}
      {isExpanded && folder.children.length > 0 && (
        <div>
          {folder.children.map((child) => (
            <FolderNode key={child.id} folder={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
