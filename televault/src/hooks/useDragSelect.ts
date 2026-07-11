import { useRef, useCallback, useState, useEffect } from 'react'
import { useFilesStore } from '../store/files.store'

interface BBox { left: number; top: number; right: number; bottom: number }

function rectsIntersect(a: BBox, b: BBox): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export interface MarqueeRect {
  x: number; y: number; width: number; height: number
}

export interface DragSelectState {
  isDragging: boolean
  marquee: MarqueeRect | null
}

const DRAG_THRESHOLD = 5

export function useDragSelect(
  cardRefs: React.RefObject<Map<string, HTMLElement>>
) {
  const startPos = useRef<{ x: number; y: number } | null>(null)
  const didDrag  = useRef(false)
  const button   = useRef<number>(0)
  const [state, setState] = useState<DragSelectState>({ isDragging: false, marquee: null })

  // Capture-phase contextmenu suppressor — blocks popup after right-drag
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (didDrag.current && button.current === 2) {
        e.preventDefault()
        e.stopPropagation()
        didDrag.current = false // reset so next right-click shows menu normally
      }
    }
    window.addEventListener('contextmenu', handler, true)
    return () => window.removeEventListener('contextmenu', handler, true)
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return
    const target = e.target as HTMLElement
    if (target.closest('[data-file-card]')) return

    if (e.button === 0) e.preventDefault()

    useFilesStore.getState().clearSelection()
    button.current   = e.button
    startPos.current = { x: e.clientX, y: e.clientY }
    didDrag.current  = false
    setState({ isDragging: false, marquee: null })
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!startPos.current) return

    const sx = startPos.current.x
    const sy = startPos.current.y
    const cx = e.clientX
    const cy = e.clientY
    const moved = Math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2)

    if (moved < DRAG_THRESHOLD && !didDrag.current) return

    didDrag.current = true

    const marquee: MarqueeRect = {
      x: Math.min(sx, cx),
      y: Math.min(sy, cy),
      width: Math.abs(cx - sx),
      height: Math.abs(cy - sy),
    }
    setState({ isDragging: true, marquee })

    const mbox: BBox = {
      left:   marquee.x,
      top:    marquee.y,
      right:  marquee.x + marquee.width,
      bottom: marquee.y + marquee.height,
    }

    const hit: string[] = []
    cardRefs.current?.forEach((el, id) => {
      const cr = el.getBoundingClientRect()
      if (rectsIntersect(mbox, { left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom })) {
        hit.push(id)
      }
    })

    useFilesStore.setState({ selectedIds: new Set(hit) })
  }, [cardRefs])

  const onMouseUp = useCallback(() => {
    startPos.current = null
    setState({ isDragging: false, marquee: null })
  }, [])

  return { state, onMouseDown, onMouseMove, onMouseUp }
}
