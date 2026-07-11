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
          'flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-sm transition-colors duration-150',
          isActive
            ? 'bg-purple-100/50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 font-medium shadow-sm'
            : 'text-neutral-600 hover:text-neutral-900 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-100'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          setPath(folder.path)
          if (hasChildren) toggleExpand(folder.id)
        }}
      >
        {/* Expand arrow */}
        <span
          className="flex h-5 w-5 items-center justify-center flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) toggleExpand(folder.id)
          }}
        >
          {hasChildren ? (
            <ChevronRight
              className={clsx(
                'h-4 w-4 text-neutral-400 dark:text-gray-500 transition-transform duration-150',
                isExpanded && 'rotate-90'
              )}
            />
          ) : (
            <span className="w-4" />
          )}
        </span>

        {/* Folder icon */}
        <Folder
          className={clsx(
            'h-4 w-4 flex-shrink-0',
            isActive ? 'text-purple-700 dark:text-purple-400' : 'text-neutral-500 dark:text-gray-500'
          )}
        />

        {/* Name */}
        <span className="flex-1 truncate text-left text-[13px]">{folder.name}</span>

        {/* File count badge */}
        {folder.fileCount > 0 && (
          <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
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
