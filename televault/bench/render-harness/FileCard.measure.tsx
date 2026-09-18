import { memo, useRef } from 'react'
import { FileCard as RealFileCard } from '../../src/components/files/FileCard'
import type { VFSEntry } from '../../src/types'

declare global {
  interface Window {
    __CARDS_RENDERED: { count: number } | undefined
  }
}

/**
 * Measurement wrapper around the REAL FileCard. Rendered in place of
 * FileCard via `resolve.alias` inside the harness only — production code is
 * untouched. Increments a global counter on every own render, so we can count
 * exactly how many cards React re-renders per commit.
 *
 * Uses the SAME memo comparator as the production FileCard, so the count
 * reflects what production users experience: only cards whose `entry` object
 * or `selected` flag actually changed re-render. Callback identity changes are
 * intentionally ignored (mirrors src/components/files/FileCard.tsx).
 */
type MeasureProps = {
  entry: VFSEntry
  selected: boolean
  onSelect: (multi: boolean, shift: boolean) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function FileCardMeasure(props: MeasureProps) {
  if (window.__CARDS_RENDERED) window.__CARDS_RENDERED.count++
  return <RealFileCard {...props} />
}

// Same comparator as production FileCard (entry identity + selected).
const sameCard = (prev: MeasureProps, next: MeasureProps): boolean =>
  prev.entry === next.entry && prev.selected === next.selected

export const FileCard = memo(FileCardMeasure, sameCard)