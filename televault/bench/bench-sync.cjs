#!/usr/bin/env electron
/**
 * Phase 1 / bench-sync.cjs
 *
 * Measures the LOCAL, deterministic portion of a full-snapshot sync round trip:
 *   push: buildIndexSnapshot() + serializeIndex() (SELECTs + JSON + gzip)
 *   pull: deserializeIndex()        (gunzip + parse)
 *         rebuild transaction       (the exact statements puller.ts runs)
 *
 * The two network legs (client.sendFile of the gzipped index, and
 * client.downloadMedia of it) are NOT measured here — they need live Telegram
 * session + channel credentials and depend on the user's connection. This
 * covers the local CPU/DB cost, which answers whether the sync MODEL is
 * computationally expensive independent of network.
 *
 * Run: npx electron bench/bench-sync.cjs
 */
const { app } = require('electron')
const os = require('os')
const path = require('path')
const fs = require('fs')

const benchDir = path.join(os.tmpdir(), `tv-bench-sync-${process.pid}`)
fs.mkdirSync(benchDir, { recursive: true })
app.setPath('userData', benchDir)

const dbm = require('../dist-electron/core/db/db')
const indexer = require('../dist-electron/core/sync/indexer')
const filesDb = require('../dist-electron/core/db/files.db')
const foldersDb = require('../dist-electron/core/db/folders.db')
const { v4: uuidv4 } = require('uuid')

const N_FILES = 600
const N_FOLDERS = 60

function populate() {
  const db = dbm.getDb()
  const now = Date.now()
  foldersDb.createFolder('Root', null, '/')
  const folderIds = [foldersDb.getFolderByPath('/').id]

  for (let i = 0; i < N_FOLDERS - 1; i++) {
    const parent = folderIds[Math.floor(Math.random() * Math.min(folderIds.length, 12))]
    const pf = foldersDb.getFolderById(parent)
    const p = pf ? pf.path : '/'
    const n = `folder-${i}`
    try { folderIds.push(foldersDb.createFolder(n, parent, p === '/' ? `/${n}` : `${p}/${n}`).id) } catch {}
  }

  const insertFile = db.prepare(
    `INSERT INTO files (id, folder_id, name, path, size, mime_type, is_encrypted, is_chunked, chunk_count, uploaded_at, updated_at, thumbnail_path, starred, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertChunk = db.prepare(
    `INSERT INTO chunks (id, file_id, chunk_index, message_id, channel_id, size) VALUES (?, ?, ?, ?, ?, ?)`
  )
  const insertVersion = db.prepare(
    `INSERT INTO versions (id, file_id, version_num, size, uploaded_at, label) VALUES (?, ?, ?, ?, ?, ?)`
  )
  const insertSettings = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`)

  const tx = db.transaction(() => {
    const fileIds = []
    for (let i = 0; i < N_FILES; i++) {
      const id = uuidv4()
      fileIds.push(id)
      const folder = folderIds[(i * 13) % folderIds.length]
      const fr = foldersDb.getFolderById(folder)
      const name = `sync-file-${i}.bin`
      const fpath = fr ? (fr.path === '/' ? `/${name}` : `${fr.path}/${name}`) : `/${name}`
      const size = 1024 * 1024 * (1 + Math.floor(Math.random() * 50))
      const chCount = size > 512 * 1024 * 1024 ? 2 : 1
      insertFile.run(id, folder, name, fpath, size, 'application/octet-stream', i % 4 === 0 ? 1 : 0, chCount > 1 ? 1 : 0, chCount, now - i * 3600000, now - i * 3600000, null, i % 7 === 0 ? 1 : 0, i % 13 === 0 ? 1 : 0)
      insertChunk.run(uuidv4(), id, 0, 400000 + i, '-1000200000001', size)
      if (chCount > 1) insertChunk.run(uuidv4(), id, 1, 500000 + i, '-1000200000001', size)
    }
    for (let i = 0; i < N_FILES; i += 20) {
      insertVersion.run(uuidv4(), fileIds[i], 1, 1024, now, 'v1')
    }
    insertSettings.run('encryption_enabled', '0')
    insertSettings.run('last_index_message_id', '123')
    insertSettings.run('theme', 'dark')
  })
  tx()
}

function timeOnce(fn) {
  const t0 = process.hrtime.bigint()
  const r = fn()
  const t1 = process.hrtime.bigint()
  return { ms: Number(t1 - t0) / 1e6, r }
}

function bench(label, fn, iterations = 20) {
  const samples = []
  for (let i = 0; i < iterations; i++) {
    const { ms } = timeOnce(fn)
    samples.push(ms)
  }
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  return { label, median: Number(median.toFixed(3)), min: Number(samples[0].toFixed(3)), max: Number(samples[samples.length - 1].toFixed(3)) }
}

function fmt(n) { return n + ' ms' }

function run() {
  populate()
  const db = dbm.getDb()
  const actual = {
    files: db.prepare('SELECT COUNT(*) n FROM files').get().n,
    folders: db.prepare('SELECT COUNT(*) n FROM folders').get().n,
    chunks: db.prepare('SELECT COUNT(*) n FROM chunks').get().n,
    versions: db.prepare('SELECT COUNT(*) n FROM versions').get().n,
  }

  // build + serialize once to get the snapshot size
  const snapshot = indexer.buildIndexSnapshot()
  const compressed = indexer.serializeIndex(snapshot)
  const jsonBytes = Buffer.byteLength(JSON.stringify(snapshot))

  console.log('=== TeleVault Phase 1 — sync local cost (full-snapshot model) ===')
  console.log(`Library: ${JSON.stringify(actual)}`)
  console.log(`Snapshot: ${(jsonBytes / 1024).toFixed(1)} KB JSON, ${(compressed.length / 1024).toFixed(1)} KB gzipped\n`)

  const pushSnap = bench('push local: buildIndexSnapshot (5 SELECTs)', () => indexer.buildIndexSnapshot())
  const pushSer = bench('push local: serializeIndex (stringify+gzip)', () => indexer.serializeIndex(snapshot))
  const pullDe = bench('pull local: deserializeIndex (gunzip+parse)', () => indexer.deserializeIndex(compressed))

  // Replicate puller.ts's rebuild transaction EXACTLY (same prepared statements).
  const pullRebuild = bench('pull local: rebuild transaction (puller.ts)', () => {
    const snap = indexer.deserializeIndex(compressed)
    const rebuild = db.transaction(() => {
      db.prepare('DELETE FROM chunks').run()
      db.prepare('DELETE FROM versions').run()
      db.prepare('DELETE FROM files').run()
      db.prepare('DELETE FROM folders').run()

      const insertFolder = db.prepare(
        `INSERT INTO folders (id, parent_id, name, path, created_at, updated_at, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      for (const f of snap.folders) insertFolder.run(f.id, f.parent_id, f.name, f.path, f.created_at, f.updated_at, f.is_hidden ?? 0)

      const insertFile = db.prepare(
        `INSERT INTO files (id, folder_id, name, path, size, mime_type, is_encrypted, is_chunked, chunk_count, uploaded_at, updated_at, thumbnail_path, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const f of snap.files) insertFile.run(f.id, f.folder_id, f.name, f.path, f.size, f.mime_type, f.is_encrypted, f.is_chunked, f.chunk_count, f.uploaded_at, f.updated_at, f.thumbnail_path, f.is_hidden ?? 0)

      const insertChunk = db.prepare(
        `INSERT INTO chunks (id, file_id, chunk_index, message_id, channel_id, size) VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const c of snap.chunks) insertChunk.run(c.id, c.file_id, c.chunk_index, c.message_id, c.channel_id, c.size)

      const insertVersion = db.prepare(
        `INSERT INTO versions (id, file_id, version_num, size, uploaded_at, label) VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const v of snap.versions) insertVersion.run(v.id, v.file_id, v.version_num, v.size, v.uploaded_at, v.label)
    })
    rebuild()
  }, 15)

  console.log('Measured local leg (no network):')
  for (const r of [pushSnap, pushSer, pullDe, pullRebuild]) {
    console.log(`  ${r.label.padEnd(42)} median=${fmt(r.median).padStart(8)}  min=${fmt(r.min)}  max=${fmt(r.max)}`)
  }
  const pushLocalTotal = pushSnap.median + pushSer.median
  const pullLocalTotal = pullDe.median + pullRebuild.median
  console.log(`\n  push local total : ${fmt(Number(pushLocalTotal.toFixed(2)))} (snapshot + serialize)`)
  console.log(`  pull local total : ${fmt(Number(pullLocalTotal.toFixed(2)))} (parse + full rebuild replace)`)

  app.exit(0)
}

run()