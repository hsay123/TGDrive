import { useState, useRef, useCallback } from 'react'
import type { VFSEntry } from '../../types'
import { FileCard } from './FileCard'
import { ContextMenu } from './ContextMenu'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'
import { useDragSelect } from '../../hooks/useDragSelect'

interface FileGridProps {
  entries?: VFSEntry[]
}

export function FileGrid({ entries: entriesProp }: FileGridProps) {
  const storeEntries = useFilesStore((s) => s.entries)
  const entries = entriesProp ?? storeEntries
  const selectedIds = useFilesStore((s) => s.selectedIds)
  const selectFile = useFilesStore((s) => s.selectFile)
  const clearSelection = useFilesStore((s) => s.clearSelection)
  const setPath = useFilesStore((s) => s.setPath)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; entry: VFSEntry
  } | null>(null)

  // Refs for drag-select
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())

  // When marquee moves, bulk-select intersecting cards
  const handleMarqueeSelect = useCallback((ids: string[]) => {
    const store = useFilesStore.getState()
    const next = new Set<string>(ids)
    store.selectedIds.forEach(id => next.add(id))
    // Replace selection with marquee result (don't accumulate from previous drags)
    useFilesStore.setState({ selectedIds: new Set(ids) })
  }, [])

  const { state: dragState, onMouseDown, onMouseMove, onMouseUp } = useDragSelect({
    containerRef,
    cardRefs,
    onSelect: handleMarqueeSelect,
    onClear: clearSelection,
  })

  const handleSelect = (entry: VFSEntry, multi: boolean) => {
    selectFile(entry.id, multi)
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
      <div
        ref={containerRef}
        className="w-full relative"
        style={{ userSelect: dragState.isDragging ? 'none' : undefined }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        // Also end drag if mouse leaves window
        onMouseLeave={onMouseUp}
      >
        {entries.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-6">
            {entries.map((entry) => (
              <div
                key={entry.id}
                data-file-card="true"
                ref={(el) => {
                  if (el) cardRefs.current.set(entry.id, el)
                  else cardRefs.current.delete(entry.id)
                }}
              >
                <FileCard
                  entry={entry}
                  selected={selectedIds.has(entry.id)}
                  onSelect={(multi, _shift) => handleSelect(entry, multi)}
                  onDoubleClick={() => handleDoubleClick(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setContextMenu({ x: e.clientX, y: e.clientY, entry })
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-gray-500">
            This folder is empty
          </div>
        )}

        {/* ── MARQUEE SELECTION BOX ── */}
        {dragState.isDragging && dragState.marquee && dragState.marquee.width > 4 && (
          <div
            style={{
              position: 'absolute',
              left: dragState.marquee.x,
              top: dragState.marquee.y,
              width: dragState.marquee.width,
              height: dragState.marquee.height,
              border: '1px solid rgba(139,92,246,0.8)',   // violet-500
              background: 'rgba(139,92,246,0.12)',
              borderRadius: 6,
              pointerEvents: 'none',
              zIndex: 50,
            }}
          />
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
