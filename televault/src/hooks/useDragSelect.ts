import { useRef, useCallback, useState } from 'react'

interface Rect { x: number; y: number; width: number; height: number }

function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

interface UseDragSelectOptions {
  containerRef: React.RefObject<HTMLElement>
  /** called with the set of IDs that are inside the marquee */
  onSelect: (ids: string[]) => void
  /** called on mousedown on background to clear selection */
  onClear: () => void
  /** map of entry id → DOM element for intersection testing */
  cardRefs: React.RefObject<Map<string, HTMLElement>>
}

export interface DragSelectState {
  isDragging: boolean
  marquee: Rect | null
}

export function useDragSelect({
  containerRef,
  onSelect,
  onClear,
  cardRefs,
}: UseDragSelectOptions) {
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const [state, setState] = useState<DragSelectState>({ isDragging: false, marquee: null })

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only left-click on the container background (not on a card)
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      // If click landed directly on a card or its child, bail out
      if (target.closest('[data-file-card]')) return
      // If right-click bail
      if (e.button !== 0) return

      e.preventDefault()
      onClear()

      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left + container.scrollLeft
      const y = e.clientY - rect.top + container.scrollTop

      startPos.current = { x, y }
      setState({ isDragging: true, marquee: { x, y, width: 0, height: 0 } })
    },
    [containerRef, onClear]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!startPos.current) return
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const curX = e.clientX - rect.left + container.scrollLeft
      const curY = e.clientY - rect.top + container.scrollTop

      const marquee: Rect = {
        x: Math.min(startPos.current.x, curX),
        y: Math.min(startPos.current.y, curY),
        width: Math.abs(curX - startPos.current.x),
        height: Math.abs(curY - startPos.current.y),
      }
      setState({ isDragging: true, marquee })

      // Live intersection — convert marquee to viewport coords for comparison
      const marqueeViewport: Rect = {
        x: marquee.x + rect.left - container.scrollLeft,
        y: marquee.y + rect.top - container.scrollTop,
        width: marquee.width,
        height: marquee.height,
      }

      const hit: string[] = []
      cardRefs.current?.forEach((el, id) => {
        const cr = el.getBoundingClientRect()
        const cardRect: Rect = { x: cr.left, y: cr.top, width: cr.width, height: cr.height }
        if (rectsIntersect(marqueeViewport, cardRect)) hit.push(id)
      })
      onSelect(hit)
    },
    [containerRef, cardRefs, onSelect]
  )

  const onMouseUp = useCallback(() => {
    startPos.current = null
    setState({ isDragging: false, marquee: null })
  }, [])

  return { state, onMouseDown, onMouseMove, onMouseUp }
}
