import { useState, useRef } from 'react'
import type { VFSEntry } from '../../types'
import { FileCard } from './FileCard'
import { ContextMenu } from './ContextMenu'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'

interface FileGridProps {
  entries?: VFSEntry[]
  cardRefs?: React.MutableRefObject<Map<string, HTMLElement>>
}

export function FileGrid({ entries: entriesProp, cardRefs: cardRefsProp }: FileGridProps) {
  const storeEntries = useFilesStore((s) => s.entries)
  const entries = entriesProp ?? storeEntries
  const selectedIds = useFilesStore((s) => s.selectedIds)
  const selectFile = useFilesStore((s) => s.selectFile)
  const setPath = useFilesStore((s) => s.setPath)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; entries: VFSEntry[]
  } | null>(null)

  // Use provided cardRefs or fallback to internal ref if none provided
  const internalRef = useRef<Map<string, HTMLElement>>(new Map())
  const cardRefs = cardRefsProp || internalRef

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
      <div className="w-full relative">
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
                    let targets = [entry]
                    if (selectedIds.has(entry.id)) {
                      targets = storeEntries.filter((e) => selectedIds.has(e.id))
                    } else {
                      selectFile(entry.id, false)
                    }
                    setContextMenu({ x: e.clientX, y: e.clientY, entries: targets })
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
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          entries={contextMenu.entries}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
