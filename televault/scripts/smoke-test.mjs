/**
 * Packaging smoke test: launch the BUILT app (not the dev server) and verify
 * the first-run UI renders, then quit cleanly.
 *
 * Usage:
 *   node scripts/smoke-test.mjs [path-to-electron-executable]
 *   # or set ELECTRON_APP=<path>
 *
 * On a headless Linux runner wrap with: xvfb-run -a npm run test:smoke
 */
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const executablePath =
  process.argv[2] ||
  process.env.ELECTRON_APP ||
  path.join(process.cwd(), 'release', 'linux-unpacked', 'televault')

if (!fs.existsSync(executablePath)) {
  console.error(`[smoke] executable not found: ${executablePath}`)
  console.error('[smoke] build the app first: npm run build:dir')
  process.exit(1)
}

// Isolate userData so the test always lands on the first-run /setup screen,
// regardless of what a previous run left in ~/.config/TeleVault.
const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-smoke-'))
const env = { ...process.env, XDG_CONFIG_HOME: userDataRoot }
if (process.platform === 'linux' && !env.DISPLAY) {
  console.error('[smoke] no DISPLAY — run under xvfb-run -a on headless Linux')
}

const consoleErrors = []
const pageErrors = []
let app

try {
  app = await electron.launch({
    executablePath,
    args: ['--no-sandbox'],
    env,
  })

  const window = await app.firstWindow({ timeout: 30000 })
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
  process.exitCode = 1
} finally {
  if (app) await app.close().catch(() => {})
  fs.rmSync(userDataRoot, { recursive: true, force: true })
}
