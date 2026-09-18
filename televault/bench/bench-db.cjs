#!/usr/bin/env electron
/**
 * Phase 1 / bench-db.cjs
 *
 * Measures the REAL SQLite query layer under the real Electron runtime
 * (better-sqlite3 is compiled against Electron's Node ABI, so we run as the
 * Electron main process). The DB lives in a throwaway userData dir under
 * /tmp so the user's real database is never touched.
 *
 * Run:   npx electron bench/bench-db.cjs
 */
const { app } = require('electron')
const os = require('os')
const path = require('path')
const fs = require('fs')

const benchDir = path.join(os.tmpdir(), `tv-bench-${process.pid}`)
fs.mkdirSync(benchDir, { recursive: true })
app.setPath('userData', benchDir)

const dbm = require('../dist-electron/core/db/db')
const filesDb = require('../dist-electron/core/db/files.db')
const foldersDb = require('../dist-electron/core/db/folders.db')
const trashDb = require('../dist-electron/core/db/trash.db')
const chunksDb = require('../dist-electron/core/db/chunks.db')
const { v4: uuidv4 } = require('uuid')

const N_FOLDERS = parseInt(process.env.TV_BENCH_FOLDERS || '60', 10)
const N_FILES = parseInt(process.env.TV_BENCH_FILES || '600', 10)

// ---------------------------------------------------------------------------
// Populate a realistic dataset: nested folders, mixed files, chunks, trash.
// ---------------------------------------------------------------------------
function populate() {
  const db = dbm.getDb()
  const now = Date.now()

  const folderIds = []
  // root
  foldersDb.createFolder('Root', null, '/')
  folderIds.push(foldersDb.getFolderByPath('/').id)

  const words = ['report', 'photo', 'backup', 'invoice', 'project', 'archive', 'data', 'design']
  let fi = 0

  for (let i = 0; i < N_FOLDERS - 1; i++) {
    const parent = folderIds[Math.floor(Math.random() * Math.min(folderIds.length, 12))] || folderIds[0]
    const parentFolder = foldersDb.getFolderById(parent)
    const parentPath = parentFolder ? parentFolder.path : '/'
    const name = `folder-${words[(i + fi) % words.length]}-${i}`
    const fpath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
    try {
      const f = foldersDb.createFolder(name, parent, fpath)
      folderIds.push(f.id)
    } catch {
      // path collision — skip
    }
  }

  // One dedicated "big folder" holding 150 files (grid-view realism).
  const bigFolder = foldersDb.createFolder('big-folder', folderIds[0], '/big-folder')
  folderIds.push(bigFolder.id)

  const insertFile = db.prepare(
    `INSERT INTO files (
      id, folder_id, name, path, size, mime_type,
      is_encrypted, is_chunked, chunk_count,
      uploaded_at, updated_at, thumbnail_path, starred, is_hidden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertChunk = db.prepare(
    `INSERT INTO chunks (id, file_id, chunk_index, message_id, channel_id, size)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const insertVersion = db.prepare(
    `INSERT INTO versions (id, file_id, version_num, size, uploaded_at, label)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const insertTrash = db.prepare(
    `INSERT INTO trash (id, original_path, file_id, folder_id, file_data, deleted_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )

  const mimePool = [
    'image/jpeg', 'image/png', 'video/mp4', 'application/pdf',
    'text/plain', 'application/zip', 'application/json', 'application/octet-stream',
  ]
  const tx = db.transaction(() => {
    for (let i = 0; i < N_FILES; i++) {
      const fname = `${words[i % words.length]}-${(i * 7) % 1003}.${ ['jpg','png','mp4','pdf','txt','zip','json','bin'][i % 8] }`
      // /big-folder holds exactly the first 150 files (dense grid-view folder);
      // files 150-200 go directly under root (gives root a realistic direct-child count);
      // the remaining 400 are spread across the tree.
      const folder =
        i < 150 ? bigFolder.id
          : i < 150 + 50 ? folderIds[0]
          : folderIds[(i * 13) % folderIds.length]
      const folderRow = foldersDb.getFolderById(folder)
      const fpath = folderRow ? (folderRow.path === '/' ? `/${fname}` : `${folderRow.path}/${fname}`) : `/${fname}`
      const id = uuidv4()
      const size = 1024 + ((i * 7919) % (80 * 1024 * 1024))
      const chunkCount = size <= 512 * 1024 * 1024 ? 1 : 2
      const updatedAt = now - ((N_FILES - i) * 3600_000)
      insertFile.run(
        id, folder, fname, fpath, size,
        mimePool[i % mimePool.length],
        i % 4 === 0 ? 1 : 0,
        chunkCount > 1 ? 1 : 0, chunkCount,
        updatedAt, updatedAt,
        i % 5 === 0 ? '/thumbnails/x.jpg' : null,
        i % 7 === 0 ? 1 : 0,   // starred
        i % 13 === 0 ? 1 : 0   // hidden
      )
      insertChunk.run(uuidv4(), id, 0, 100000 + i, '-1000200000001', size)
      if (chunkCount > 1) insertChunk.run(uuidv4(), id, 1, 200000 + i, '-1000200000001', size)
      if (i % 10 === 0) {
        insertVersion.run(uuidv4(), id, 1, size, updatedAt - 86400000, 'v1')
      }
    }
    // ~40 trash entries, some already expired
    for (let i = 0; i < 40; i++) {
      insertTrash.run(
        uuidv4(),
        `/deleted/${i}-file.bin`,
        i % 2 === 0 ? uuidv4() : null,
        null,
        JSON.stringify({ name: `deleted-${i}.bin`, size: 1000 + i, mime_type: 'application/octet-stream', _chunks: [{ id: uuidv4(), file_id: 'x', chunk_index: 0, message_id: 300000 + i, channel_id: '-1000200000001', size: 1000 }] }),
        now - i * 3600_000,
        i % 3 === 0 ? now - 1000 : now + 31 * 86400000
      )
    }
  })
  tx()
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------
function timeOnce(fn) {
  const t0 = process.hrtime.bigint()
  fn()
  const t1 = process.hrtime.bigint()
  return Number(t1 - t0) / 1e6 // ms
}

function bench(label, fn, iterations, warmup = 3) {
  for (let i = 0; i < warmup; i++) fn()
  const samples = []
  for (let i = 0; i < iterations; i++) samples.push(timeOnce(fn))
  samples.sort((a, b) => a - b)
  const median = samples[Math.floor(samples.length / 2)]
  const p95 = samples[Math.floor(samples.length * 0.95)]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return { label, iterations, median, p95, mean }
}

function fmt(n) {
  return Number(n.toFixed(3)) + ' ms'
}

// EXPLAIN QUERY PLAN for the exact SQL each operation runs.
function explain(sql, ...params) {
  const db = dbm.getDb()
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params)
  return rows.map((r) => `    ${r.detail}`).join('\n')
}

function run() {
  populate()
  const db = dbm.getDb()

  const rootFolderId = foldersDb.getFolderByPath('/').id
  const bigFolder = foldersDb.getFolderByPath('/big-folder')
  const deepFolder = foldersDb.getFolderById(foldersDb.getChildFolders(bigFolder.id, false)[0]?.id ?? rootFolderId)

  console.log('=== TeleVault Phase 1 — SQLite query benchmarks (Electron runtime) ===\n')
  console.log(`Dataset: ${N_FOLDERS} folders, ${N_FILES} files on disk, userData=${benchDir}`)
  const counts = {
    files: db.prepare('SELECT COUNT(*) n FROM files').get().n,
    folders: db.prepare('SELECT COUNT(*) n FROM folders').get().n,
    chunks: db.prepare('SELECT COUNT(*) n FROM chunks').get().n,
    trash: db.prepare('SELECT COUNT(*) n FROM trash').get().n,
    filesInBigFolder: db.prepare('SELECT COUNT(*) n FROM files WHERE folder_id = ?').get(bigFolder.id).n,
  }
  console.log(`Actual counts: ${JSON.stringify(counts)}\n`)

  const results = []

  // 1. Folder listing (the exact two queries vfs.listFolder runs)
  results.push(bench('files:list root (all child folders + files)', () => {
    foldersDb.getChildFolders(rootFolderId, false)
    filesDb.getFilesByFolder(rootFolderId, false)
  }, 200))

  results.push(bench('files:list /big-folder (150 files)', () => {
    foldersDb.getChildFolders(bigFolder.id, false)
    filesDb.getFilesByFolder(bigFolder.id, false)
  }, 200))

  results.push(bench('files:list deep folder (sparse)', () => {
    foldersDb.getChildFolders(deepFolder.id, false)
    filesDb.getFilesByFolder(deepFolder.id, false)
  }, 200, 2))

  // 2. Search — leading-wildcard LIKE (fundamentally a full scan)
  results.push(bench('files:search("report")', () => filesDb.searchFiles('report'), 100))
  results.push(bench('files:search("proj")', () => filesDb.searchFiles('proj'), 100))
  results.push(bench('files:search("archive-4")', () => filesDb.searchFiles('archive-4'), 100))

  // 3. Recent
  results.push(bench('files:recent(50)', () => filesDb.getRecentFiles(50), 200))

  // 4. Starred
  results.push(bench('files:starred', () => filesDb.getStarredFiles(), 100))

  // 5. Trash listing + expiry sweep
  results.push(bench('trash:list (all)', () => trashDb.getTrashedFiles(), 100))
  results.push(bench('trash:getExpiredTrashEntries', () => trashDb.getExpiredTrashEntries(), 200))

  // 6. Sidebar folder tree (GROUP BY count + full folder scan)
  results.push(bench('folders:getFolderTree (sidebar)', () => foldersDb.getFolderTree(false), 100))

  // 7. Single-row lookups used on hot paths
  results.push(bench('files:getFileById', () => filesDb.getFileById('x'), 500, 10))
  results.push(bench('chunks:getChunksByFileId', () => { chunksDb.getChunksByFileId('x') }, 500, 10))

  // 8. Write throughput (baseline before any index is added)
  results.push(bench('files:INSERT single row', () => writeOnefile(), 200, 5))

  console.log('Measurements (lower is better):')
  for (const r of results) {
    console.log(
      `  ${r.label.padEnd(46)} median=${fmt(r.median).padStart(9)}  p95=${fmt(r.p95).padStart(9)}  mean=${fmt(r.mean).padStart(9)}  (n=${r.iterations})`
    )
  }

  console.log('\n=== EXPLAIN QUERY PLAN ===\n')
  console.log('folder listing — child files (root):')
  console.log(explain('SELECT * FROM files WHERE folder_id = ? AND is_hidden = 0 ORDER BY name ASC', rootFolderId))
  console.log('search name/path:')
  console.log(explain('SELECT * FROM files WHERE (name LIKE ? COLLATE NOCASE OR path LIKE ? COLLATE NOCASE) AND is_hidden = 0 ORDER BY uploaded_at DESC', '%report%', '%report%'))
  console.log('recent:')
  console.log(explain('SELECT * FROM files WHERE is_hidden = 0 ORDER BY uploaded_at DESC LIMIT ?', 50))
  console.log('starred:')
  console.log(explain('SELECT * FROM files WHERE starred = 1 AND is_hidden = 0 ORDER BY updated_at DESC'))
  console.log('trash list:')
  console.log(explain('SELECT * FROM trash ORDER BY deleted_at DESC'))
  console.log('trash expiry:')
  console.log(explain('SELECT * FROM trash WHERE expires_at < ? ORDER BY expires_at ASC', Date.now()))
  console.log('tree count:')
  console.log(explain('SELECT folder_id, COUNT(*) AS count FROM files WHERE is_hidden = 0 GROUP BY folder_id'))
  console.log('chunks by file:')
  console.log(explain('SELECT * FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC', 'x'))

  console.log('\nindex-scan (what WOULD an index do?):')
  console.log(explain('SELECT * FROM files INDEXED BY sqlite_autoindex_files_1 WHERE folder_id = ?', bigFolder.id))
}

function writeOnefile() {
  const db = dbm.getDb()
  db.prepare(
    `INSERT INTO files (
      id, folder_id, name, path, size, mime_type,
      is_encrypted, is_chunked, chunk_count,
      uploaded_at, updated_at, thumbnail_path, starred, is_hidden
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), foldersDb.getFolderByPath('/big-folder').id, `bench-insert-${Math.random().toString(36).slice(2)}.bin`, `/big-folder/bench-insert-${Math.random().toString(36).slice(2)}.bin`, 100, 'application/octet-stream', 0, 0, 1, Date.now(), Date.now(), null, 0, 0)
}

run()
app.exit(0)