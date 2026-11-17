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

const executablePath = process.argv[2] || process.env.ELECTRON_APP || defaultExecutable()

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
const env = { ...process.env }
if (process.platform === 'linux') {
  env.XDG_CONFIG_HOME = userDataRoot
  if (!env.DISPLAY) {
    console.error('[smoke] no DISPLAY — run under xvfb-run -a on headless Linux')
  }
}
const args = [`--user-data-dir=${userDataRoot}`]
if (process.platform === 'linux') args.push('--no-sandbox')

const consoleErrors = []
const pageErrors = []
let app
let window

try {
  app = await electron.launch({ executablePath, args, env })
  window = await app.firstWindow({ timeout: 30000 })
  // Capture renderer-side failures in the main process global so they survive
  // even when Playwright's Page target is stale on Windows.
  await app.evaluate((electron) => {
    const win = electron.BrowserWindow.getAllWindows()[0]
    if (!win) return
    globalThis.__smokeLogs = []
    win.webContents.on('console-message', (_ev, level, message) => {
      globalThis.__smokeLogs.push(`console:${level}:${message}`)
    })
    win.webContents.on('did-fail-load', (_ev, code, desc, url) => {
      globalThis.__smokeLogs.push(`did-fail-load:${code}:${desc}:${url}`)
    })
  }).catch(() => {})
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  window.on('pageerror', (err) => pageErrors.push(String(err)))

  await window.waitForLoadState('domcontentloaded')

  // Read the renderer DOM through Electron's own webContents rather than
  // Playwright's locator: on windows-2022 the initial loadFile() navigation can
  // be dropped while Playwright attaches, leaving a blank file:///<drive>:/
  // page. Re-issuing the load after attach works; retry for a bounded period
  // and assert against the real renderer text on every platform.
  const deadline = Date.now() + 60000
  let lastReload = 0
  let bodyText = ''
  const reloadRenderer = async () => {
    await app.evaluate(async (electron) => {
      const win = electron.BrowserWindow.getAllWindows()[0]
      if (!win) throw new Error('no app window to reload')
      const root = electron.app.getAppPath()
      const indexPath = root.includes('\\')
        ? `${root}\\dist\\index.html`
        : `${root}/dist/index.html`
      await win.loadFile(indexPath)
    })
  }
  while (Date.now() < deadline) {
    bodyText = await app
      .evaluate(async (electron) => {
        const win = electron.BrowserWindow.getAllWindows()[0]
        if (!win) return ''
        return String(await win.webContents.executeJavaScript('document.body.innerText', true))
      })
      .catch(() => '')
    if (bodyText.includes('Welcome to TeleVault') && bodyText.includes('API ID')) break
    if (Date.now() - lastReload >= 8000) {
      console.log('[smoke] setup screen not rendered — reloading packaged renderer')
      await reloadRenderer().catch(() => {})
      lastReload = Date.now()
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  if (!bodyText.includes('Welcome to TeleVault') || !bodyText.includes('API ID')) {
    throw new Error('first-run /setup screen did not render in the packaged app')
  }

  console.log('[smoke] first-run /setup screen rendered ("Welcome to TeleVault", "API ID")')
  console.log(`[smoke] console errors: ${consoleErrors.length}; page errors: ${pageErrors.length}`)
  for (const e of consoleErrors.slice(0, 5)) console.log(`  console: ${e.slice(0, 200)}`)
  for (const e of pageErrors.slice(0, 5)) console.log(`  page:    ${e.slice(0, 200)}`)

  if (pageErrors.length > 0) {
    throw new Error(`${pageErrors.length} uncaught page error(s) during first-run render`)
  }
  console.log('[smoke] PASS')
} catch (err) {
  console.error('[smoke] FAIL:', err.message)
  if (app) {
    try {
      const logs = await app.evaluate(() => globalThis.__smokeLogs || [])
      console.error('[smoke] renderer logs:', JSON.stringify(logs.slice(-20)))
    } catch {
      /* ignore */
    }
    try {
      const dom = await app.evaluate(async (electron) => {
        const win = electron.BrowserWindow.getAllWindows()[0]
        if (!win) return { error: 'no app window' }
        const text = await win.webContents.executeJavaScript('document.body.innerText', true)
        return {
          url: win.webContents.getURL(),
          title: win.webContents.getTitle(),
          text: String(text).slice(0, 800),
          playwrightWindows: undefined,
        }
      })
      console.error('[smoke] app window DOM:', JSON.stringify(dom))
    } catch (e) {
      console.error('[smoke] app window DOM: <unavailable>', e.message)
    }
    try {
      console.error('[smoke] playwright windows:', app.windows().map((w) => w.url()))
    } catch {
      /* ignore */
    }
  }
  if (window) {
    try {
      console.error('[smoke] window URL:', window.url())
    } catch {
      /* window may already be closed */
    }
    try {
      const bodyText = await window.locator('body').innerText({ timeout: 5000 })
      console.error('[smoke] body text:', bodyText.slice(0, 1500).replace(/\n+/g, ' | '))
    } catch {
      console.error('[smoke] body text: <unavailable>')
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
