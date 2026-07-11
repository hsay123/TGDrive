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
  onSelect: (ids: string[]) => void
  onClear: () => void
  cardRefs: React.RefObject<Map<string, HTMLElement>>
}

export interface DragSelectState {
  isDragging: boolean
  // marquee in VIEWPORT (fixed) coordinates — used for both rendering and intersection
  marquee: Rect | null
}

export function useDragSelect({
  containerRef,
  onSelect,
  onClear,
  cardRefs,
}: UseDragSelectOptions) {
  // Store start in viewport coords — no scroll offset needed
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const [state, setState] = useState<DragSelectState>({ isDragging: false, marquee: null })

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      // Bail if clicked directly on a card or any child inside a card
      if (target.closest('[data-file-card]')) return

      e.preventDefault()
      onClear()

      // Use raw viewport coords — avoids all scroll-offset math
      startPos.current = { x: e.clientX, y: e.clientY }
      setState({ isDragging: true, marquee: { x: e.clientX, y: e.clientY, width: 0, height: 0 } })
    },
    [onClear]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!startPos.current) return

      // Marquee entirely in viewport coords
      const marquee: Rect = {
        x: Math.min(startPos.current.x, e.clientX),
        y: Math.min(startPos.current.y, e.clientY),
        width: Math.abs(e.clientX - startPos.current.x),
        height: Math.abs(e.clientY - startPos.current.y),
      }
      setState({ isDragging: true, marquee })

      // getBoundingClientRect() is already in viewport coords — direct comparison, no offsets
      const hit: string[] = []
      cardRefs.current?.forEach((el, id) => {
        const cr = el.getBoundingClientRect()
        if (rectsIntersect(marquee, { x: cr.left, y: cr.top, width: cr.width, height: cr.height })) {
          hit.push(id)
        }
      })
      onSelect(hit)
    },
    [cardRefs, onSelect]
  )

  const onMouseUp = useCallback(() => {
    startPos.current = null
    setState({ isDragging: false, marquee: null })
  }, [])

  return { state, onMouseDown, onMouseMove, onMouseUp }
}
