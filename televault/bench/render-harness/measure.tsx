import { createRoot } from 'react-dom/client'
import { StrictMode, Profiler, useEffect, useState, useRef } from 'react'
import { createElement } from 'react'
import { FileGrid } from '../../src/components/files/FileGrid'
import { useFilesStore } from '../../src/store/files.store'

declare global {
  interface Window {
    televault: any
  }
  var __TV_RESULT: any
}

// ── minimal electron API stub (the components read these) ──────────────
window.televault = {
  files: {
    list: async () => ({ success: true, data: [] }),
    saveThumbnail: async () => ({ success: true }),
    downloadFirstChunkToTemp: async () => ({ success: false, error: 'stub-skip' }),
  },
  folders: { getTree: async () => ({ success: true, data: null }) },
  system: { getChannelStatus: async () => ({ ok: true, data: { ready: true } }) },
}

const WORDS = ['report', 'photo', 'backup', 'invoice', 'project', 'archive', 'data', 'design']
const MIMES = ['image/png', 'image/jpeg', 'application/pdf', 'text/plain', 'video/mp4', 'application/zip']

function makeEntries(n: number) {
  const entries: any[] = []
  for (let i = 0; i < n; i++) {
    const w = WORDS[i % WORDS.length]
    entries.push({
      id: `file-${i}`,
      type: 'file',
      name: `${w}-${i}.${['png', 'jpg', 'pdf', 'txt', 'mp4', 'zip'][i % 6]}`,
      path: `/big-folder/${w}-${i}.bin`,
      size: 1024 * (i + 1),
      mimeType: MIMES[i % MIMES.length],
      folderId: 'f1',
      isEncrypted: i % 4 === 0,
      isChunked: false,
      chunkCount: 1,
      uploadedAt: Date.now() - i * 3600000,
      updatedAt: Date.now() - i * 3600000,
      thumbnailPath: null,
      starred: i % 7 === 0 ? 1 : 0,
      isHidden: 0,
    })
  }
  return entries
}

// ── Profiler + counters ─────────────────────────────────────────────────
const COMMITS: any[] = []
let commitId = 0
let onRenderCalls = 0
window.__ON_RENDER_CALLS = 0

function onRender(
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
) {
  onRenderCalls++
  window.__ON_RENDER_CALLS++
  const last = COMMITS[COMMITS.length - 1]
  const cardDelta = last ? CardsRendered.count - last.cards : CardsRendered.count
  COMMITS.push({
    commit: ++commitId,
    phase,
    actualDuration: Number(actualDuration.toFixed(3)),
    baseDuration: Number(baseDuration.toFixed(3)),
    cardsRenderedTotal: CardsRendered.count,
    cardDelta,
    committedAt: Date.now(),
  })
}

// Global render counter incremented by the FileCard measurement wrapper
// (see resolve.alias → FileCard.measure.tsx)
const CardsRendered = { count: 0 }
window.__CARDS_RENDERED = CardsRendered

// ── scenario driver ─────────────────────────────────────────────────────
let scenario = ''
const N = Number(new URLSearchParams(location.search).get('n') || '150')

function byIndex(i: number): HTMLElement | null {
  const wrapper = document.querySelectorAll('[data-file-card]')[i] as HTMLElement | null
  // The wrapper div itself carries no handlers — events must target FileCard's
  // inner root element (its first child) for React's synthetic onClick /
  // onContextMenu to fire.
  return (wrapper?.firstElementChild as HTMLElement | null) ?? wrapper
}

function fire(el: Element, type: string, opts: any = {}) {
  el.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: opts.x ?? 10,
      clientY: opts.y ?? 10,
      ctrlKey: !!opts.ctrlKey,
      metaKey: !!opts.metaKey,
      shiftKey: !!opts.shiftKey,
      button: opts.button ?? 0,
    })
  )
}

function card(i: number) {
  const el = byIndex(i)
  if (!el) throw new Error(`card ${i} not found`)
  return el
}

async function scenarioMount() {
  scenario = 'mount'
  // entries are already set; FileGrid renders on commit below
}

function scenarioClick() {
  scenario = 'click-single'
  const el = card(3)
  fire(el, 'mousedown')
  fire(el, 'mouseup')
  fire(el, 'click')
}

function scenarioMetaClick() {
  scenario = 'click-meta'
  const el = card(7)
  fire(el, 'mousedown', { metaKey: true, ctrlKey: true })
  fire(el, 'mouseup', { metaKey: true, ctrlKey: true })
  fire(el, 'click', { metaKey: true, ctrlKey: true })
}

function scenarioContextMenu() {
  scenario = 'contextmenu'
  const el = card(5)
  fire(el, 'contextmenu', { button: 2 })
}

function scenarioBulkSelect() {
  scenario = 'bulk-select-30'
  const ids: string[] = []
  for (let i = 0; i < 30; i++) ids.push(`file-${i}`)
  useFilesStore.getState().selectFile('file-0', false)
  useFilesStore.getState().selectFile('file-0', true, ids)
}

async function gatherDomStats() {
  await new Promise((r) => setTimeout(r, 100))
  const cards = document.querySelectorAll('[data-file-card]').length
  const totalEls = document.querySelectorAll('*').length
  const docHeight = document.documentElement.scrollHeight
  const windowHeight = window.innerHeight
  return { cards, totalEls, docHeight, windowHeight }
}

function App() {
  const [phase, setPhase] = useState<'init' | 'done'>('init')
  const scrollRef = useRef<HTMLDivElement>(null)
  const forceFull = location.search.includes('full=1')

  useEffect(() => {
    const run = async () => {
      const sel = () => useFilesStore.getState().selectedIds.size
      const selection: Record<string, number> = {}

      useFilesStore.setState({ entries: makeEntries(N) })
      await new Promise((r) => setTimeout(r, 100))
      scenarioMount()
      await new Promise((r) => setTimeout(r, 180))
      const container = scrollRef.current
      const snapshot = () => ({
        cards: document.querySelectorAll('[data-file-card]').length,
        totalEls: container ? container.querySelectorAll('*').length : document.querySelectorAll('*').length,
        scrollHeight: container?.scrollHeight ?? document.documentElement.scrollHeight,
        windowHeight: window.innerHeight,
      })
      const stats: any = { mount: snapshot() }

      scenarioClick()
      selection.afterClick = sel()
      await new Promise((r) => setTimeout(r, 80))
      scenarioMetaClick()
      selection.afterMetaClick = sel()
      await new Promise((r) => setTimeout(r, 80))
      scenarioContextMenu()
      selection.afterContextMenu = sel()
      await new Promise((r) => setTimeout(r, 80))
      document.body.click({} as any)
      await new Promise((r) => setTimeout(r, 80))
      scenarioBulkSelect()
      selection.afterBulk = sel()
      await new Promise((r) => setTimeout(r, 80))
      stats.end = snapshot()

      window.__TV_RESULT = {
        scenario: forceFull ? 'render-full' : 'render-virtualized',
        cards: N,
        onRenderCalls,
        commits: COMMITS,
        stats,
        selection,
      }
      setPhase('done')
    }
    run()
  }, [])

  return createElement(
    Profiler,
    { id: 'grid', onRender } as any,
    createElement(
      'div',
      {
        ref: scrollRef,
        style: { height: '100vh', overflowY: 'auto' },
        'data-tv-scroll-root': 'true',
      } as any,
      createElement(FileGrid, { scrollRef, marqueeActive: forceFull } as any)
    )
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)

setTimeout(() => {
  if (!window.__TV_RESULT) {
    window.__TV_RESULT = { error: 'harness timeout' }
  }
}, 20000)