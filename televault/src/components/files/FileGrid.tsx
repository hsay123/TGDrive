import { useState, useRef } from 'react'
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
  const setPath = useFilesStore((s) => s.setPath)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; entry: VFSEntry
  } | null>(null)

  // Refs for drag-select
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Hook manages all drag-select logic internally — no callbacks needed
  const { state: dragState, onMouseDown, onMouseMove, onMouseUp } = useDragSelect(cardRefs)

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
        className="w-full relative"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
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
                    if (!selectedIds.has(entry.id)) {
                      selectFile(entry.id, false)
                    }
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

        {/* ── MARQUEE SELECTION BOX (fixed = viewport coords, matches hook) ── */}
        {dragState.isDragging && dragState.marquee && dragState.marquee.width > 4 && (
          <div
            style={{
              position: 'fixed',
              left: dragState.marquee.x,
              top: dragState.marquee.y,
              width: dragState.marquee.width,
              height: dragState.marquee.height,
              border: '1px solid rgba(168,85,247,0.85)',
              background: 'rgba(168,85,247,0.12)',
              borderRadius: 6,
              pointerEvents: 'none',
              zIndex: 9999,
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
