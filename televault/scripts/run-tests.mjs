/**
 * Run the unit tests under Electron's Node runtime.
 *
 * Native modules (better-sqlite3, keytar) are rebuilt for Electron's ABI by
 * `postinstall`, so plain `node` cannot load them (NODE_MODULE_VERSION 121 vs
 * 127). Launching vitest via the Electron binary with ELECTRON_RUN_AS_NODE=1
 * gives us the matching ABI without rebuild-and-restore gymnastics, and works
 * on Linux, macOS and Windows (unlike inline `VAR=value` shell syntax).
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const vitestBin = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs')

// Default to non-interactive `run`; allow `npm test -- --watch` etc. to pass through.
const extra = process.argv.slice(2)
const vitestArgs = extra.length > 0 ? extra : ['run']

const result = spawnSync(electronPath, [vitestBin, '--pool=threads', ...vitestArgs], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
