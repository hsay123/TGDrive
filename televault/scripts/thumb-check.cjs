// Temporary diagnostic: prove the thumbnail download fix (commit 6a2115b)
// runs end-to-end against the REAL Telegram session, using the app's own
// core/telegram code with the same 15s timeout bound as electron/ipc/files.ipc.ts.
// Run: npx electron scripts/thumb-check.cjs
const fs = require('fs')
const path = require('path')
const os = require('os')
const Module = require('module')
const { app } = require('electron')

app.setPath('userData', path.join(os.homedir(), '.config', 'televault'))

// ── Load .ts sources via esbuild, with extension-less resolution ────────────
const esbuild = require('esbuild')

const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  try {
    return origResolve.call(this, request, parent, isMain, options)
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND' || !request.startsWith('.')) throw err
    const base = path.resolve(path.dirname(parent.filename), request)
    const candidates = [
      base + '.ts',
      base + '.tsx',
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return origResolve.call(this, c, parent, isMain, options)
      }
    }
    throw err
  }
}

require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8')
  const { code } = esbuild.transformSync(content, {
    loader: 'ts',
    format: 'cjs',
    platform: 'node',
    target: 'node20',
  })
  module._compile(code, filename)
}

// Mirror of the timeout bound in electron/ipc/files.ipc.ts
function withTimeout(promise, ms, stage) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`thumb-${stage}-timeout (${ms}ms)`)),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

const FILE_ID = process.argv[2] || 'a5d363a5-425f-4bd7-961f-cc2aced9cafe'
const THUMB_TIMEOUT_MS = parseInt(process.argv[3] || '15000', 10)

app.whenReady().then(async () => {
  const client = require('../core/telegram/client')
  const downloader = require('../core/telegram/downloader')
  try {
    const session = client.getSetting('telegram_session')
    if (!session) {
      console.log('OUTCOME: no-session')
      app.exit(2)
      return
    }

    await client.initClient(session)

    const started = Date.now()
    let cachedPath = null
    try {
      cachedPath = await withTimeout(
        downloader.downloadFirstChunkToTemp(FILE_ID),
        THUMB_TIMEOUT_MS,
        'downloadFirstChunkToTemp'
      )
      console.log('OUTCOME: downloaded-in-bound')
    } catch (err) {
      console.log('OUTCOME: ' + (err && err.message ? err.message : String(err)))
    }
    console.log('ELAPSED_MS: ' + (Date.now() - started))

    if (cachedPath) {
      const stat = fs.statSync(cachedPath)
      const fd = fs.openSync(cachedPath, 'r')
      const buf = Buffer.alloc(16)
      fs.readSync(fd, buf, 0, 16, 0)
      fs.closeSync(fd)
      const ftyp = buf.slice(4, 8).toString('latin1')
      console.log('PARTIAL_FILE: ' + cachedPath)
      console.log('PARTIAL_SIZE: ' + stat.size)
      console.log('PARTIAL_FOURCC: ' + ftyp)
      console.log('PARTIAL_VALID_MP4: ' + (ftyp === 'ftyp' && stat.size > 0))
    }
  } catch (err) {
    console.log('OUTCOME: error: ' + (err && err.stack ? err.stack : String(err)))
  } finally {
    try {
      await client.destroyClient()
    } catch {}
    app.exit(0)
  }
})
