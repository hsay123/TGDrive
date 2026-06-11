import clsx from 'clsx'
import { Folder, Lock } from 'lucide-react'
import type { VFSEntry } from '../../types'
import { formatFileSize } from '../../lib/utils'
import { FileIcon } from './FileIcon'
import { ContextMenu } from './ContextMenu'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'
import { useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

type SortKey = 'name' | 'size' | 'type' | 'updated'
type SortDir = 'asc' | 'desc'

interface FileListProps {
  entries?: VFSEntry[]
}

export function FileList({ entries: entriesProp }: FileListProps) {
  const storeEntries = useFilesStore((s) => s.entries)
  const rawEntries = entriesProp ?? storeEntries
  const selectedIds = useFilesStore((s) => s.selectedIds)
  const selectFile = useFilesStore((s) => s.selectFile)
  const setPath = useFilesStore((s) => s.setPath)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; entry: VFSEntry
  } | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const parentRef = useRef<HTMLDivElement>(null)
  const lastSelectedRef = useRef<string | null>(null)

  const sorted = [...rawEntries].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else if (sortKey === 'size') {
      const sizeA = a.type === 'file' ? a.size : 0
      const sizeB = b.type === 'file' ? b.size : 0
      cmp = sizeA - sizeB
    } else if (sortKey === 'type') {
      const mimeA = a.type === 'file' ? (a.mimeType ?? '') : 'folder'
      const mimeB = b.type === 'file' ? (b.mimeType ?? '') : 'folder'
      cmp = mimeA.localeCompare(mimeB)
    } else if (sortKey === 'updated') {
      cmp = (a.updatedAt ?? 0) - (b.updatedAt ?? 0)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  })

  const handleSelect = (entry: VFSEntry, multi: boolean, shift: boolean, index: number) => {
    if (shift && lastSelectedRef.current !== null) {
      const lastIdx = sorted.findIndex((e) => e.id === lastSelectedRef.current)
      if (lastIdx >= 0 && index !== lastIdx) {
        const start = Math.min(lastIdx, index)
        const end = Math.max(lastIdx, index)
        const rangeIds = sorted.slice(start, end + 1).map((e) => e.id)
        selectFile(entry.id, true, rangeIds)
        return
      }
    }
    selectFile(entry.id, multi)
    lastSelectedRef.current = entry.id
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="ml-1 text-gray-700">↕</span>
    return <span className="ml-1 text-violet-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <>
      <div ref={parentRef} className="h-full overflow-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[32px]" />
            <col />
            <col className="w-[80px]" />
            <col className="w-[80px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-gray-950 text-left text-xs text-gray-500 border-b border-gray-800">
            <tr>
              <th className="px-2 py-3" />
              <th
                className="px-3 py-3 font-medium cursor-pointer hover:text-gray-300 select-none"
                onClick={() => toggleSort('name')}
              >
                Name <SortIcon col="name" />
              </th>
              <th
                className="px-3 py-3 font-medium cursor-pointer hover:text-gray-300 select-none"
                onClick={() => toggleSort('size')}
              >
                Size <SortIcon col="size" />
              </th>
              <th
                className="px-3 py-3 font-medium cursor-pointer hover:text-gray-300 select-none"
                onClick={() => toggleSort('type')}
              >
                Type <SortIcon col="type" />
              </th>
              <th
                className="px-3 py-3 font-medium cursor-pointer hover:text-gray-300 select-none"
                onClick={() => toggleSort('updated')}
              >
                Modified <SortIcon col="updated" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              <td colSpan={5} style={{ padding: 0, position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vRow) => {
                  const entry = sorted[vRow.index]
                  const isSelected = selectedIds.has(entry.id)
                  return (
                    <div
                      key={vRow.key}
                      data-index={vRow.index}
                      className={clsx(
                        'absolute left-0 w-full flex items-center cursor-pointer border-b border-gray-800/50 transition-colors duration-100',
                        vRow.index % 2 === 0 ? 'bg-gray-900' : 'bg-gray-800/30',
                        isSelected ? 'bg-violet-600/10' : 'hover:bg-gray-800/60'
                      )}
                      style={{
                        top: `${vRow.start}px`,
                        height: `${vRow.size}px`,
                      }}
                      onClick={(e) => handleSelect(entry, e.metaKey || e.ctrlKey, e.shiftKey, vRow.index)}
                      onDoubleClick={() => {
                        if (entry.type === 'folder') setPath(entry.path)
                        else setPreviewEntryId(entry.id)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, entry })
                      }}
                    >
                      {/* Icon col */}
                      <div className="w-[32px] pl-2 flex-shrink-0">
                        {entry.type === 'folder' ? (
                          <Folder className="h-4 w-4 text-violet-400" />
                        ) : (
                          <FileIcon mime={entry.mimeType} size="sm" />
                        )}
                      </div>
                      {/* Name */}
                      <div className="flex-1 min-w-0 px-3 flex items-center gap-2">
                        <span className="truncate text-gray-100">{entry.name}</span>
                        {entry.type === 'file' && entry.isEncrypted && (
                          <Lock className="h-3 w-3 text-teal-500 flex-shrink-0" />
                        )}
                      </div>
                      {/* Size */}
                      <div className="w-[80px] px-3 text-gray-500 text-xs flex-shrink-0">
                        {entry.type === 'file' ? formatFileSize(entry.size) : '—'}
                      </div>
                      {/* Type */}
                      <div className="w-[80px] px-3 text-gray-500 text-xs flex-shrink-0 uppercase truncate">
                        {entry.type === 'file'
                          ? (entry.mimeType?.split('/')[1]?.slice(0, 6) ?? 'FILE')
                          : 'FOLDER'}
                      </div>
                      {/* Modified */}
                      <div className="w-[120px] px-3 text-gray-500 text-xs flex-shrink-0">
                        {entry.type === 'file'
                          ? new Date(entry.updatedAt).toLocaleDateString()
                          : '—'}
                      </div>
                    </div>
                  )
                })}
              </td>
            </tr>
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="flex h-64 items-center justify-center text-gray-500">
            This folder is empty
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
