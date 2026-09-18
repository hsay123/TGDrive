import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import type { VFSEntry } from '../../types'
import { FileCard } from './FileCard'
import { ContextMenu } from './ContextMenu'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'
import { useVirtualizer } from '@tanstack/react-virtual'

interface FileGridProps {
  entries?: VFSEntry[]
  cardRefs?: React.MutableRefObject<Map<string, HTMLElement>>
  /** Scrolling container that hosts this grid. When provided, the grid is
   *  virtualized (only visible cards stay in the DOM). When null (legacy /
   *  search views) the grid renders fully, exactly as before. */
  scrollRef?: React.RefObject<HTMLElement | null>
  /** Set while a marquee drag is in progress. useDragSelect caches whole-card
   *  bounding rects during a drag, which only works if every card is mounted,
   *  so the grid degrades to the full (non-virtualized) layout while dragging. */
  marqueeActive?: boolean
}

// minmax(120px,1fr) gap-6 from the original markup, kept as constants so the
// virtualized layout matches the old one visually.
const MIN_CARD = 120
const GAP = 24
const FOOTER_PX = 46

interface CtxState {
  x: number; y: number; entries: VFSEntry[]
}

export function FileGrid({
  entries: entriesProp,
  cardRefs: cardRefsProp,
  scrollRef,
  marqueeActive,
}: FileGridProps) {
  const storeEntries = useFilesStore((s) => s.entries)
  const entries = entriesProp ?? storeEntries
  const selectedIds = useFilesStore((s) => s.selectedIds)
  const selectFile = useFilesStore((s) => s.selectFile)
  const setPath = useFilesStore((s) => s.setPath)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)

  const [contextMenu, setContextMenu] = useState<CtxState | null>(null)

  // Use provided cardRefs or fallback to internal ref if none provided
  const internalRef = useRef<Map<string, HTMLElement>>(new Map())
  const cardRefs = cardRefsProp || internalRef

  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapWidth, setWrapWidth] = useState(0)

  // Track the grid container width so the lane count / cell width can follow
  // the resizable window.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setWrapWidth(entries[0]?.contentRect.width ?? 0)
    })
    ro.observe(el)
    setWrapWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const scrollEl = scrollRef?.current ?? null
  const canVirtualize = Boolean(scrollEl) && entries.length > 0 && !marqueeActive

  const lanes = Math.max(
    1,
    Math.floor(((wrapWidth || MIN_CARD) + GAP) / (MIN_CARD + GAP))
  )
  const cellWidth = Math.max(MIN_CARD, (wrapWidth - (lanes - 1) * GAP) / lanes)

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: () => cellWidth + FOOTER_PX,
    lanes,
    gap: GAP,
    overscan: 4,
  })

  // Re-measure the virtualized layout when the container width changes (lane
  // count / cell width shift).
  useLayoutEffect(() => {
    if (!canVirtualize) return
    virtualizer.measure()
  }, [canVirtualize, lanes, cellWidth, virtualizer])

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

  const handleContextMenu = (entry: VFSEntry, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    let targets = [entry]
    if (selectedIds.has(entry.id)) {
      targets = storeEntries.filter((el) => selectedIds.has(el.id))
    } else {
      selectFile(entry.id, false)
    }
    setContextMenu({ x: e.clientX, y: e.clientY, entries: targets })
  }

  const registerCard = (entryId: string) => (el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(entryId, el)
    else cardRefs.current.delete(entryId)
  }

  const renderCell = (entry: VFSEntry, style?: React.CSSProperties) => (
    <div
      key={entry.id}
      data-file-card="true"
      ref={registerCard(entry.id)}
      style={style}
    >
      <FileCard
        entry={entry}
        selected={selectedIds.has(entry.id)}
        onSelect={(multi, _shift) => handleSelect(entry, multi)}
        onDoubleClick={() => handleDoubleClick(entry)}
        onContextMenu={(e) => handleContextMenu(entry, e)}
      />
    </div>
  )

  return (
    <>
      <div className="w-full relative" ref={wrapRef}>
        {entries.length > 0 ? (
          canVirtualize ? (
            <div
              className="relative"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const entry = entries[item.index]
                return renderCell(entry, {
                  position: 'absolute',
                  left: item.lane * (cellWidth + GAP),
                  top: item.start,
                  width: cellWidth,
                })
              })}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-6">
              {entries.map((entry) => renderCell(entry))}
            </div>
          )
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