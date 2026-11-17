/**
 * Packaging smoke test: launch the BUILT app (not the dev server) and verify
 * the first-run UI renders, then quit cleanly.
 *
 * Usage:
 *   node scripts/smoke-test.mjs [path-to-electron-executable]
 *   # or set ELECTRON_APP=<path>
 *
 * The default executable is auto-detected per platform from electron-builder's
 * unpacked output. On headless Linux wrap with: xvfb-run -a npm run test:smoke
 */
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const RELEASE = path.join(process.cwd(), 'release')

/** Unpacked output directories electron-builder produces for each platform. */
function defaultExecutable() {
  const appName = 'TeleVault'
  switch (process.platform) {
    case 'win32':
      return path.join(RELEASE, 'win-unpacked', `${appName}.exe`)
    case 'darwin': {
      // electron-builder names the .app dir mac / mac-arm64 / mac-universal.
      for (const dir of ['mac', 'mac-arm64', 'mac-universal']) {
        const candidate = path.join(
          RELEASE,
          dir,
          `${appName}.app`,
          'Contents',
          'MacOS',
          appName
        )
        if (fs.existsSync(candidate)) return candidate
      }
      return path.join(RELEASE, 'mac', `${appName}.app`, 'Contents', 'MacOS', appName)
    }
    default:
      return path.join(RELEASE, 'linux-unpacked', 'televault')
  }
}

const executablePath =
  process.argv[2] ||
  process.env.TELEVAULT_SMOKE_EXE ||
  process.env.ELECTRON_APP ||
  defaultExecutable()

if (!fs.existsSync(executablePath)) {
  console.error(`[smoke] executable not found: ${executablePath}`)
  console.error('[smoke] build the app first: npm run build:dir')
  process.exit(1)
}

// Isolate userData so the test always lands on the first-run /setup screen,
// regardless of what a previous run left in the real config location.
// --user-data-dir is honoured by Electron on all three OSes; XDG_CONFIG_HOME
// is kept as a Linux-only extra.
const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-smoke-'))
const env = { ...process.env, TELEVAULT_SMOKE: '1' }
if (process.platform === 'linux') {
  env.XDG_CONFIG_HOME = userDataRoot
  if (!env.DISPLAY) {
    console.error('[smoke] no DISPLAY — run under xvfb-run -a on headless Linux')
  }
}
const args = [`--user-data-dir=${userDataRoot}`]
if (process.platform === 'linux') args.push('--no-sandbox')
// The main process appends diagnostics (including RENDERER_READY) here when
// TELEVAULT_SMOKE=1. Polling the file does not depend on Playwright's target.
const markerLogPath = path.join(userDataRoot, 'tv-smoke.log')
const readMarkerLog = () => {
  try {
    return fs.readFileSync(markerLogPath, 'utf8')
  } catch {
    return ''
  }
}

const consoleErrors = []
const pageErrors = []
const mainLogs = []
let markerSeen = false
let app
let window

try {
  app = await electron.launch({ executablePath, args, env })
  // The renderer calls a smoke-only IPC when the first-run screen mounts; the
  // main process logs RENDERER_READY. This is the authoritative signal — it
  // does not depend on Playwright's Page target, which can be stale on Windows.
  app.on('console', (msg) => {
    mainLogs.push(`${msg.type()}: ${msg.text()}`)
    if (msg.text().includes('RENDERER_READY')) markerSeen = true
  })
  window = await app.firstWindow({ timeout: 30000 })
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  window.on('pageerror', (err) => pageErrors.push(String(err)))

  await window.waitForLoadState('domcontentloaded').catch(() => {})

  // Wait up to 30s for the renderer-side readiness marker, observed either on
  // the main-process console or in the app's own smoke log file.
  const deadline = Date.now() + 30000
  while (!markerSeen && Date.now() < deadline) {
    if (readMarkerLog().includes('RENDERER_READY')) markerSeen = true
    if (!markerSeen) await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (!markerSeen) {
    throw new Error('renderer-ready marker (RENDERER_READY) not seen within 30s')
  }
  console.log('[smoke] renderer-ready marker seen: RENDERER_READY')
  console.log('[smoke] app smoke log:\n' + readMarkerLog().trimEnd())
  console.log(`[smoke] console errors: ${consoleErrors.length}; page errors: ${pageErrors.length}`)
  for (const e of consoleErrors.slice(0, 5)) console.log(`  console: ${e.slice(0, 200)}`)
  for (const e of pageErrors.slice(0, 5)) console.log(`  page:    ${e.slice(0, 200)}`)

  if (pageErrors.length > 0) {
    throw new Error(`${pageErrors.length} uncaught page error(s) during first-run render`)
  }
  console.log('[smoke] PASS')
} catch (err) {
  console.error('[smoke] FAIL:', err.message)
  console.error('[smoke] app smoke log:\n' + (readMarkerLog().trimEnd() || '(empty — app never wrote diagnostics)'))
  console.error(`[smoke] main-process log (${mainLogs.length} lines):`)
  for (const line of mainLogs) console.error('  main:', line.slice(0, 500))
  // Diagnostics so a CI-only failure can be triaged from the log without the
  // runner machine. Read the real Electron window too — Playwright's Page
  // target can be stale on Windows.
  if (app) {
    try {
      const dom = await app.evaluate(async (electron) => {
        const win = electron.BrowserWindow.getAllWindows()[0]
        if (!win) return { error: 'no app window' }
        const text = await win.webContents.executeJavaScript('document.body.innerText', true)
        return { url: win.webContents.getURL(), text: String(text).slice(0, 800) }
      })
      console.error('[smoke] app window DOM:', JSON.stringify(dom))
    } catch {
      /* ignore */
    }
  }
  if (window) {
    try {
      console.error('[smoke] playwright window URL:', window.url())
    } catch {
      /* window may already be closed */
    }
  }
  console.error(`[smoke] console errors (${consoleErrors.length}):`)
  for (const e of consoleErrors.slice(0, 10)) console.error('  console:', e.slice(0, 500))
  console.error(`[smoke] page errors (${pageErrors.length}):`)
  for (const e of pageErrors.slice(0, 10)) console.error('  page:', e.slice(0, 500))
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  fs.rmSync(userDataRoot, { recursive: true, force: true })
}
