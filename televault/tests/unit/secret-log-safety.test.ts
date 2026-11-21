import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Static guard: no production log statement may carry a Telegram credential.
 * This is deliberately source-grep based so a future change cannot reintroduce
 * a value log without failing the unit test suite.
 */
const SOURCE_DIRS = ['core', 'electron', 'src', 'scripts', 'bench']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-electron', 'release', 'tests'])

const LOG_CALL =
  /\b(?:console\.(?:log|warn|error|info|debug)|log\.(?:warn|error|info|debug|silly))\s*\(([^)]*)\)/g
const SECRET_TOKENS = [
  /telegram_session/,
  /telegram_api_id/,
  /telegram_api_hash/,
  /\bapiId\b/,
  /\bapiHash\b/,
  /\btrimId\b/,
  /\btrimHash\b/,
  /getSessionString\s*\(/,
  /\bsessionString\b/,
]

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  if (!fs.existsSync(dir)) return found
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...sourceFiles(full))
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      found.push(full)
    }
  }
  return found
}

describe('credential log safety', () => {
  it('does not log the session, API ID or API hash anywhere in production source', () => {
    const root = process.cwd()
    const violations: string[] = []

    for (const dir of SOURCE_DIRS) {
      for (const file of sourceFiles(path.join(root, dir))) {
        const source = fs.readFileSync(file, 'utf-8')
        for (const match of source.matchAll(LOG_CALL)) {
          const args = match[1] ?? ''
          const token = SECRET_TOKENS.find((pattern) => pattern.test(args))
          if (token) {
            violations.push(
              `${path.relative(root, file)}: log call matches ${token}`
            )
          }
        }
      }
    }

    expect(violations).toEqual([])
  })
})
