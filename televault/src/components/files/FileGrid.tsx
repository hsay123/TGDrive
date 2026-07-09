import { useState } from 'react'
import type { VFSEntry } from '../../types'
import { FileCard } from './FileCard'
import { ContextMenu } from './ContextMenu'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'

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
    x: number
    y: number
    entry: VFSEntry
  } | null>(null)

  const handleSelect = (entry: VFSEntry, multi: boolean, shift: boolean) => {
    // Basic select, ignoring complex shift-select logic for grid simplicity, 
    // or can rely on store's implementation if robust enough.
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
      <div className="w-full">
        {entries.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-6">
            {entries.map((entry) => (
              <FileCard
                key={entry.id}
                entry={entry}
                selected={selectedIds.has(entry.id)}
                onSelect={(multi, shift) => handleSelect(entry, multi, shift)}
                onDoubleClick={() => handleDoubleClick(entry)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, entry })
                }}
              />
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
          entry={contextMenu.entry}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
