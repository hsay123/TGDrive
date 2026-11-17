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
  window.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  window.on('pageerror', (err) => pageErrors.push(String(err)))

  await window.waitForLoadState('domcontentloaded')
  await window.getByText('Welcome to TeleVault').waitFor({ timeout: 30000 })
  const apiLabel = window.getByText('API ID', { exact: true }).first()
  await apiLabel.waitFor({ timeout: 10000 })
  if (!(await apiLabel.isVisible())) {
    throw new Error('API ID label is not visible on the setup screen')
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
  // Diagnostics: show what the app actually rendered so a CI-only failure can
  // be diagnosed from the log without needing the runner machine.
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
