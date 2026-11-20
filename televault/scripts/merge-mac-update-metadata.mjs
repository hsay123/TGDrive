/**
 * Merge the per-architecture `latest-mac.yml` files produced by the two macOS
 * build jobs into one update manifest.
 *
 * electron-updater reads a single `latest-mac.yml` and filters `files[]` by
 * architecture (x64 clients exclude arm64 entries). The release workflow builds
 * x64 and arm64 on separate runners, so each job emits a manifest with only its
 * own files; staging then copies both to the same path and one silently wins.
 * This script concatenates the `files:` blocks so the published manifest lists
 * both architectures, which is what electron-builder writes when both arches
 * are built in a single invocation.
 *
 * Uses only Node built-ins: the assemble job does not run `npm ci`.
 *
 * Usage:
 *   node scripts/merge-mac-update-metadata.mjs <artifactsDir> <outFile>
 */
import fs from 'node:fs'
import path from 'node:path'

function splitMacUpdateYaml(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => /^files:\s*$/.test(line))
  if (start < 0) throw new Error('latest-mac.yml has no files: block')

  let end = start + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end++

  const groups = []
  for (const line of lines.slice(start + 1, end)) {
    if (line.trim() === '') continue
    if (/^\s+-\s+url:/.test(line)) groups.push([line])
    else if (groups.length > 0) groups[groups.length - 1].push(line)
    else throw new Error('latest-mac.yml files: block has an orphan line')
  }
  if (groups.length === 0) throw new Error('latest-mac.yml files: block is empty')

  return {
    header: lines.slice(0, start + 1),
    entries: groups,
    trailer: lines.slice(end).filter((line) => line.trim() !== ''),
  }
}

export function mergeMacUpdateYaml(texts) {
  const parts = texts.map(splitMacUpdateYaml)
  const versions = new Set(
    parts.map((part) => part.header.find((line) => /^version:/.test(line)))
  )
  if (versions.size !== 1) throw new Error('latest-mac.yml versions do not match')

  const byUrl = new Map()
  for (const part of parts) {
    for (const entry of part.entries) {
      const url = entry[0].match(/^\s+-\s+url:\s*(\S+)/)?.[1]
      if (!url) throw new Error('latest-mac.yml file entry has no url')
      if (!byUrl.has(url)) byUrl.set(url, entry)
    }
  }
  if (![...byUrl.values()].some((entry) => entry[0].includes('.zip'))) {
    throw new Error('latest-mac.yml has no .zip update payload')
  }

  const merged = [...parts[0].header, ...[...byUrl.values()].flat(), ...parts[0].trailer]
  return `${merged.join('\n')}\n`
}

function findManifests(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...findManifests(full))
    else if (entry.name === 'latest-mac.yml') found.push(full)
  }
  return found.sort()
}

function main() {
  const [artifactsDir, outFile] = process.argv.slice(2)
  if (!artifactsDir || !outFile) {
    console.error('usage: node scripts/merge-mac-update-metadata.mjs <artifactsDir> <outFile>')
    process.exit(1)
  }

  const manifests = findManifests(artifactsDir)
  if (manifests.length === 0) {
    console.error(`[mac-update] no latest-mac.yml found under ${artifactsDir}`)
    process.exit(1)
  }
  const merged = mergeMacUpdateYaml(manifests.map((file) => fs.readFileSync(file, 'utf8')))
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, merged)
  console.log(`[mac-update] wrote ${outFile} from ${manifests.length} manifests:`)
  for (const file of manifests) console.log(`  ${file}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main()
}
