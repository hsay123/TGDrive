/**
 * Generate release/SHA256SUMS.txt for the fixed-name installer artifacts.
 *
 * Usage:
 *   node scripts/generate-checksums.mjs [releaseDir]
 *
 * Output is sha256sum-compatible ("<hex>  <filename>"), sorted by filename so
 * the result is byte-for-byte identical regardless of which OS produced it.
 * Only the published installers are hashed — unpacked dirs, builder-debug.yml,
 * latest-*.yml (auto-update metadata) and partial files are excluded.
 *
 * The macOS .zip is intentionally not listed: it is an internal auto-update
 * payload, not one of the published installer names.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const releaseDir = process.argv[2] || path.join(process.cwd(), 'release')

// The complete set of possible published installers. A universal macOS build
// and two-arch (x64 + arm64) builds are mutually exclusive in practice; only
// files actually present are hashed.
const PUBLISHED_INSTALLERS = [
  'TeleVault-windows-x64.exe',
  'TeleVault-macos-universal.dmg',
  'TeleVault-macos-x64.dmg',
  'TeleVault-macos-arm64.dmg',
  'TeleVault-linux-x64.AppImage',
  'TeleVault-linux-x64.deb',
  'TeleVault-linux-x64.rpm',
]

const present = PUBLISHED_INSTALLERS.filter((name) =>
  fs.existsSync(path.join(releaseDir, name))
)
if (present.length === 0) {
  console.error(`[checksums] no installer artifacts found in ${releaseDir}`)
  process.exit(1)
}

const lines = present
  .map((name) => {
    const bytes = fs.readFileSync(path.join(releaseDir, name))
    const hash = createHash('sha256').update(bytes).digest('hex')
    return `${hash}  ${name}`
  })
  .sort((a, b) => a.localeCompare(b))

const outPath = path.join(releaseDir, 'SHA256SUMS.txt')
fs.writeFileSync(outPath, `${lines.join('\n')}\n`)

console.log(`[checksums] wrote ${outPath} (${present.length} artifacts)`)
for (const line of lines) console.log(`  ${line}`)
