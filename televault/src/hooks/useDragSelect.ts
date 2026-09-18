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
  const startPos        = useRef<{ x: number; y: number } | null>(null)
  const didDrag         = useRef(false)
  const button          = useRef<number>(0)
  const animFrameId     = useRef<number | null>(null)

  // ── OPTIMIZATION 1: Cache all card rects — never calls getBoundingClientRect
  //    in onMouseMove. Populated lazily on the first drag frame.
  // Under grid virtualization only the visible cards are mounted at mousedown,
  // so we defer measurement until AFTER FileGrid has switched to its full
  // (non-virtualized) layout for the drag. The single deferred frame guarantees
  // every card exists when we read its rect.
  const cachedRects     = useRef<Map<string, BBox>>(new Map())
  const rectsNeedSync   = useRef(true)

  // ── OPTIMIZATION 3: Track last hit set to skip no-op store updates ──────────
  const lastHitKey      = useRef<string>('')

  const [state, setState] = useState<DragSelectState>({ isDragging: false, marquee: null })

  // Capture-phase contextmenu suppressor — blocks popup after right-drag
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (didDrag.current && button.current === 2) {
        e.preventDefault()
        e.stopPropagation()
        didDrag.current = false
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
    lastHitKey.current = ''

    // Rects are captured on the first drag frame (after the grid has switched
    // to its full layout if virtualization is active), not here at mousedown —
    // see note above. Clear any stale cache from a previous drag.
    cachedRects.current.clear()
    rectsNeedSync.current = true

    setState({ isDragging: false, marquee: null })
  }, [cardRefs])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!startPos.current) return

    const sx = startPos.current.x
    const sy = startPos.current.y
    const cx = e.clientX
    const cy = e.clientY
    const moved = Math.sqrt((cx - sx) ** 2 + (cy - sy) ** 2)

    if (moved < DRAG_THRESHOLD && !didDrag.current) return
    didDrag.current = true

    // ── OPTIMIZATION 2: Throttle via requestAnimationFrame ──────────────────
    // Cancel any pending frame so we never queue up stale calculations
    if (animFrameId.current !== null) {
      cancelAnimationFrame(animFrameId.current)
    }

    // Snapshot coords for the rAF closure (avoids reading stale SyntheticEvent)
    const snapCx = cx
    const snapCy = cy
    const snapSx = sx
    const snapSy = sy

    animFrameId.current = requestAnimationFrame(() => {
      animFrameId.current = null

      // 1 — Compute marquee rect
      const marquee: MarqueeRect = {
        x:      Math.min(snapSx, snapCx),
        y:      Math.min(snapSy, snapCy),
        width:  Math.abs(snapCx - snapSx),
        height: Math.abs(snapCy - snapSy),
      }

      setState({ isDragging: true, marquee })

      const mbox: BBox = {
        left:   marquee.x,
        top:    marquee.y,
        right:  marquee.x + marquee.width,
        bottom: marquee.y + marquee.height,
      }

      const computeHits = () => {
        // 2 — Intersect against CACHED rects (zero getBoundingClientRect calls)
        const hit: string[] = []
        cachedRects.current.forEach((bbox, id) => {
          if (rectsIntersect(mbox, bbox)) hit.push(id)
        })

        // 3 — Skip store update if selection hasn't changed (avoid re-render)
        const hitKey = hit.sort().join(',')
        if (hitKey === lastHitKey.current) return
        lastHitKey.current = hitKey

        useFilesStore.setState({ selectedIds: new Set(hit) })
      }

      if (rectsNeedSync.current) {
        // Latest FileGrid commit (full grid during marquee) lands before the
        // next frame, so read every card's rect now via one deferred frame.
        requestAnimationFrame(() => {
          rectsNeedSync.current = false
          cachedRects.current.clear()
          cardRefs.current?.forEach((el, id) => {
            const cr = el.getBoundingClientRect()
            cachedRects.current.set(id, {
              left:   cr.left,
              top:    cr.top,
              right:  cr.right,
              bottom: cr.bottom,
            })
          })
          computeHits()
        })
      } else {
        computeHits()
      }
    })
  }, [])  // no deps — everything read via refs

  const onMouseUp = useCallback(() => {
    // Cancel any pending animation frame
    if (animFrameId.current !== null) {
      cancelAnimationFrame(animFrameId.current)
      animFrameId.current = null
    }
    startPos.current = null
    cachedRects.current.clear()
    setState({ isDragging: false, marquee: null })
  }, [])

  return { state, onMouseDown, onMouseMove, onMouseUp }
}
