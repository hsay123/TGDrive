#!/usr/bin/env electron
/**
 * Phase 1 / render-harness/main.cjs
 *
 * Opens a hidden BrowserWindow, loads the built harness bundle, waits for
 * window.__TV_RESULT, prints it as JSON to stdout and exits.
 *
 * Build first:   npx vite build --config bench/render-harness/vite.config.ts
 * Run:           npx electron --no-sandbox bench/render-harness/main.cjs
 * Vary size:     npx electron --no-sandbox bench/render-harness/main.cjs --n=600
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')

app.setPath('userData', path.join(require('os').tmpdir(), `tv-render-bench-${process.pid}`))

const TIMEOUT_MS = 30000
const abs = path.join(__dirname, 'dist/index.html')
const n = process.env.TV_N ?? process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? '150'
const full = process.argv.includes('--full=1') || process.env.TV_FULL === '1'

function finish(code, payload) {
  console.log(payload !== undefined ? JSON.stringify(payload) : '')
  app.exit(code)
}

async function main() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
      nodeIntegration: true,
    },
  })
  const fileUrl =
    'file://' +
    encodeURI(abs).replace(/[()]/g, (c) => encodeURIComponent(c)) +
    `?n=${n}` +
    (full ? '&full=1' : '')
  await win.loadURL(fileUrl)
  const deadline = Date.now() + TIMEOUT_MS
  for (;;) {
    if (Date.now() > deadline) {
      finish(1, { error: 'harness timeout' })
      return
    }
    const result = await win.webContents.executeJavaScript(
      `(window.__TV_RESULT ? JSON.parse(JSON.stringify(window.__TV_RESULT)) : null)`
    )
    if (result) {
      finish(0, result)
      return
    }
    await new Promise((r) => setTimeout(r, 200))
  }
}

app.whenReady().then(main).catch((e) => finish(1, { error: String(e) }))