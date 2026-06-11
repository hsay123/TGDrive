import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { VFSEntry } from '../../types'
import { FileCard } from './FileCard'
import { ContextMenu } from './ContextMenu'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'

function getColumnCount(width: number): number {
  if (width < 800) return 2
  if (width < 1100) return 3
  if (width < 1400) return 4
  return 5
}

interface FileGridProps {
  entries?: VFSEntry[]
}

export function FileGrid({ entries: entriesProp }: FileGridProps) {
  const storeEntries = useFilesStore((s) => s.entries)
  const entries = entriesProp ?? storeEntries
  const selectedIds = useFilesStore((s) => s.selectedIds)
  const selectFile = useFilesStore((s) => s.selectFile)
  const setPath = useFilesStore((s) => s.setPath)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)
  const parentRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    entry: VFSEntry
  } | null>(null)
  const lastSelectedRef = useRef<string | null>(null)

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const columns = getColumnCount(containerWidth)
  const rowCount = Math.ceil(entries.length / columns) || 1

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 2,
  })

  const handleSelect = (entry: VFSEntry, multi: boolean, shift: boolean, index: number) => {
    if (shift && lastSelectedRef.current !== null) {
      const lastIdx = entries.findIndex((e) => e.id === lastSelectedRef.current)
      if (lastIdx >= 0 && index !== lastIdx) {
        const start = Math.min(lastIdx, index)
        const end = Math.max(lastIdx, index)
        const rangeIds = entries.slice(start, end + 1).map((e) => e.id)
        selectFile(entry.id, true, rangeIds)
        return
      }
    }
    selectFile(entry.id, multi)
    lastSelectedRef.current = entry.id
  }

  const handleDoubleClick = (entry: VFSEntry) => {
    if (entry.type === 'folder') {
      setPath(entry.path)
    } else {
      setPreviewEntryId(entry.id)
    }
  }

  return (
    <>
      <div ref={parentRef} className="h-full overflow-auto p-4">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const rowEntries = entries.slice(
              virtualRow.index * columns,
              virtualRow.index * columns + columns
            )
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 grid w-full gap-3 px-1"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {rowEntries.map((entry, colIdx) => {
                  const index = virtualRow.index * columns + colIdx
                  return (
                    <FileCard
                      key={entry.id}
                      entry={entry}
                      selected={selectedIds.has(entry.id)}
                      onSelect={(multi, shift) =>
                        handleSelect(entry, multi, shift, index)
                      }
                      onDoubleClick={() => handleDoubleClick(entry)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, entry })
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
        {entries.length === 0 && (
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
