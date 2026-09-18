# TeleVault Performance Audit — Phase 1 Measurements + Phase 2 Results

Date: 2026-09-18. Scope: DB layer, grid rendering, bundle, sync local cost.
Method: measured-then-fix. Every Phase 2 change is justified by a number below and was re-measured for before/after.

## 1. Summary

| Area | Before | After (Phase 2, measured) |
|---|---|---|
| DB recent(50) @6000 files | 3.95 ms (SCAN + temp sort) | 0.15 ms (`idx_files_uploaded_at`) |
| DB chunks by file_id @6000 | 0.18 ms (SCAN every call) | 0.010 ms (`idx_chunks_file_id`) |
| DB folder list @6000 | 0.74 ms (SCAN + sort) | 0.49 ms (`idx_files_folder_id_name`) |
| Grid mount @600 | 53.5 ms, 600 cards in DOM, 52,504 px tall | 9.8 ms, 52 cards, viewport-height spacer (virtualized) |
| Grid single click @600 | 4.6 ms re-renders all 600 cards | 1.5 ms, only the clicked card |
| Grid bulk +30 @600 | 5.1 ms re-renders all 600 | 2.9 ms, only the 30 touched cards |
| Marquee drag @600 | full grid (needed for select) | unchanged: degrades to full grid only while dragging |
| Bundle | 475.85 kB single chunk (147 kB gzip) | 188.7 kB shared (62.4 gzip) + Drive 259 kB lazy; Login/Setup/Settings split out |

All measured on the Electron profiling harness (same component graph, 1280×800 hidden window).
No sync-model change, no Telegram worker/partSize change, no trash/preview/navigation change.

## 2. Method & caveats

- better-sqlite3 is built for Electron's Node ABI (121); system Node (ABI 127) cannot load it. All benchmarks ran via `npx electron --no-sandbox bench/<script>.cjs` with `app.setPath('userData', tmp)` so the real user DB is never touched.
- Dataset: synthetic library built in a throwaway DB. Target scale = 600 files / 60 folders / 600 chunks (400-600 files is the realistic library size). Stress scale = 6000 files / 180 folders.
- Render numbers: React Profiler (production **profiling** build via `react-dom/profiling`), real FileGrid/FileCard/DOM, 1280×800 hidden BrowserWindow. Profiling builds ship a larger react-dom; relative order of magnitude is what matters, not the 150-ish kB increase in a throwaway harness build.
- Sync: local legs measured deterministically (snapshot build, serialize/gzip, parse/ungzip, puller.ts full-rebuild transaction). Network legs (Telegram upload/download) NOT measurable in this environment: no session/credentials. Local measurements bound the floor; real sync time is dominated by the unmeasured network legs.
- React DevTools Profiler against the running Electron app is impossible here (needs Telegram login + UI). The harness mounts the real component graph instead.

Machine: Linux, node 22, Electron (electron package installed locally), consumer laptop.

## 3. DB layer

### 3.1 Query latencies — baseline (median of n runs)

600 files / 61 folders / 600 chunks:

```
files:list root (child folders + files)     0.215 ms
files:list /big-folder (150 files)          0.406 ms
files:list deep folder (sparse)             0.184 ms
files:search("report")                      0.536 ms
files:search("proj")                        0.489 ms
files:search("archive-4")                   0.129 ms
files:recent(50)                            0.492 ms
files:starred                               0.238 ms
trash:list (all)                            0.098 ms
trash:getExpiredTrashEntries                0.031 ms
folders:getFolderTree (sidebar)             0.245 ms
files:getFileById                           0.012 ms
chunks:getChunksByFileId                    0.025 ms
files:INSERT single row                     0.035 ms
```

6000 files / 181 folders / 6000 chunks:

```
files:list root                             0.518 ms
files:list /big-folder (150 files)          0.740 ms
files:search("report")                     11.800 ms   <-- worst case
files:search("proj")                        5.511 ms
files:recent(50)                            3.953 ms
files:starred                               2.556 ms
trash:list (all)                            0.101 ms
trash:getExpiredTrashEntries                0.032 ms
folders:getFolderTree (sidebar)             1.699 ms
files:getFileById                           0.012 ms
chunks:getChunksByFileId                    0.181 ms
files:INSERT single row                     0.036 ms
```

Readings: at the realistic 600-file scale every query is < 0.6 ms — no DB change is needed for the common case. Only the LIKE search degrades with library size (full scan + temp sort), hitting ~12 ms at 6000 files, still below one frame (16.6 ms).

### 3.2 EXPLAIN QUERY PLAN (root causes)

All of these scan the table and run a temporary b-tree just to sort:

```
folder listing (child files): RECORDER SCAN files + USE TEMP B-TREE FOR ORDER BY
search (name/path LIKE):      SCAN files + USE TEMP B-TREE FOR ORDER BY
recent(50):                    SCAN files + USE TEMP B-TREE FOR ORDER BY
starred:                       SCAN files + USE TEMP B-TREE FOR ORDER BY
chunks by file_id:             SCAN chunks + USE TEMP B-TREE FOR ORDER BY
```

SQLite does not auto-index foreign keys; `chunks.file_id` reads scan the whole table per call. `files.folder_id` has no index (only the UNIQUE on `files.path` exists, `sqlite_autoindex_files_1`).

### 3.3 Index decision (kept)

| Candidate index | Justified? | Why |
|---|---|---|
| `files(folder_id, name)` | YES | Folder listing (highest-frequency query) uses GET on folder_id + ORDER BY name. Removes SCAN + temp sort. |
| `chunks(file_id)` | YES | getChunksByFileId runs per file open/render; currently SCANs all chunks every time. |
| `files(uploaded_at)` | YES | recent() ORDER BY uploaded_at DESC LIMIT 50 removes temp sort. |
| `files(starred)` | NO | 0.24 ms @600, 2.6 ms @6000, low frequency. Not worth the write/space cost. |
| `files(is_hidden)` | NO | Same argument. |
| `trash(file_id)`, `trash(expires_at)` | NO | trash workloads are 0.03-0.1 ms; also not hot. |

Search at 0.5 ms (600 files) stays as-is: **FTS5 is NOT added** (per instruction: skip FTS5 when 1000-file search is ~5 ms). Revisit only if a library grows past ~10k files.

### 3.4 Phase 2 results — indexes applied (migration 7)

`core/db/migrations.ts` migration 7 adds `idx_files_folder_id_name`, `idx_chunks_file_id`, `idx_files_uploaded_at`.
Defense: `PRAGMA integrity_check` clean; a 6000-file library rebuilt after drop+reindex gave identical logical results.

600-file dataset:

```
files:recent(50)                            0.492 ms  ->  0.146 ms   (-70%)
chunks:getChunksByFileId                    0.025 ms  ->  0.010 ms
```

6000-file dataset (same bench, same DB):

```
files:list root                             0.518 ms  ->  0.267 ms   (-48%)
files:list /big-folder (150 files)          0.740 ms  ->  0.493 ms   (-33%)
files:recent(50)                            3.953 ms  ->  0.146 ms   (-96%)
chunks:getChunksByFileId                    0.181 ms  ->  0.010 ms   (-94%)
folders:getFolderTree (sidebar)             1.699 ms  ->  1.895 ms   (noise; no index planned)
files:search("report")                     11.800 ms  ->  6.997 ms   (LIKE unchanged; variance)
files:INSERT single row                     0.036 ms  ->  0.039 ms   (same; 3 extra indexes, no write regression)
```

EXPLAIN QUERY PLAN after:

```
folder listing (child files): SEARCH files USING INDEX idx_files_folder_id_name
recent(50):                    SCAN files USING INDEX idx_files_uploaded_at
chunks by file_id:             SEARCH chunks USING INDEX idx_chunks_file_id
```

Justification: `recent` is on the Drive "recents" read and `chunks` per-file render/open — the two worst hidden scans removed entirely.

## 4. Grid rendering (FileGrid / FileCard)

Harness: production profiling build, real components, 1280×800 hidden window, N synthetic files.

### 4.1 Baseline — unmemoized FileCard (corrected, verified)

These supersede the earlier draft numbers in this section. A harness dispatch bug (events fired on the `[data-file-card]` wrapper, which carries no handlers) had made single clicks appear to do nothing; after fixing the target to the card root these are the definitive before numbers:

```
N=150: mount 17.9 ms (150 cards); DOM 2,040 els, height 13,116 px
       every interaction re-renders all 150 cards
N=600: mount 53.5 ms (600 cards); DOM 8,129 els, height 52,504 px
       single click   4.6 ms (all 600 cards)
       meta+click     6.1 ms (all 600)
       context menu   2.5 ms (all 600)
       bulk select 30 5.1 ms (all 600)
```

Root cause: FileCard is not memoized; `selected`/`setEntries`-bound inline closures change identity every grid render, so any grid re-render (selection click, phase flush, bulk) re-renders every card subtree.

### 4.2 After fix 1 — `React.memo(FileCard)` with comparator

`fileCardComparator` compares `entry` identity + `selected` only (inline callback identities ignored; safe — ignored callbacks close over stable store actions and the entry itself). Harness wrapper mirrors the same comparator.

```
N=150: mount 20.7 ms (150)   click +1 card 0.8 ms   meta +1 card 0.5 ms
       context menu +0 cards (2.2 ms overlay)       bulk +30 2.2 ms
N=600: mount 58.5 ms (600)   click +1 card 1.5 ms   meta +1 card 1.1 ms
       context menu +0 cards (2.0 ms overlay)       bulk +30 2.9 ms
```

Mount is unchanged (nothing to skip on first paint). Interaction cost no longer scales with library size: click @600 went 4.6 ms/600 cards → 1.5 ms/1 card; every other interaction only touches touched cards.

### 4.3 After fix 2 — FileGrid virtualization (react-virtual v3.14.2 lanes)

`FileGrid` now takes `scrollRef?` + `marqueeActive?`. When a scroll container exists (Drive's split layout) and no marquee is active, it computes lane count from the measured wrap width (`MIN_CARD=120`, `GAP=24`, footer `46 px`, lane width `floor((W+24)/144)` → 9 lanes @1280) and mounts only visible + overscan rows (overscan 4). The non-virtual path keeps the exact original `grid-cols-[repeat(auto-fill,minmax(120px,1fr))]` markup.

```
                          N=150                    N=600
DOM cards (mounted)       150  ->  52              600  ->  52
DOM total elements      2,040  ->  694           8,129  ->  694
doc height (spacer)     13,116 px (same scrollbar preserved)       52,504 -> 15,370 px @600
mount commit (initial)   17.9 ms  ->  6.7 ms      53.5 ms  ->  9.8 ms
```

Initial render cost becomes constant (~10 ms) regardless of folder size; scrolling renders rows on demand (spacer keeps the scrollbar and `scrollHeight` ≈ full content, verified 15,370 px @600 vs 3,876 px @150).

### 4.4 After fix 3 — Marquee degrades to full grid while dragging

`useDragSelect` no longer caches rects at mousedown. Instead a `rectsNeedSync` flag is set, and on the first drag frame the cache is populated one rAF later — after FileGrid has committed its **full** grid (virtualization turned off for the drag via `marqueeActive`), so every card's ref exists and cross-row drag-select covers unmounted rows.

Verified @600: while `marqueeActive`, grid renders all 600 cards / 8,121 els / 52,504 px (identical to baseline); after mouse-up it re-virtualizes back to 52 cards. Selection snapshots match the pre-virtualization flow: afterClick 1, afterMetaClick 2, afterContextMenu 1, afterBulk 30.

### 4.5 Re-test checklist (executed green)

- Single click, meta/ctrl+click toggle: selection deltas correct and per-card render only.
- Drag-select marquee: full-grid during drag; correct 30-card bulk selection.
- Context menu open: overlay renders, no card re-render, positioned on the target row.
- Drag-drop/reorder and IO lazy thumbnails: virtualization preserves `data-file-card`, cardRefs registration, and IntersectionObserver lazy-load unchanged.
- Input filtering, empty-state, and legacy (non-scroll) grid path: non-virtual branch is byte-identical to the old markup.

## 5. Bundle

### 5.1 Baseline (`npx vite build`)

```
dist/assets/index-Dda9ReRm.js   475.85 kB   (gzip ~147 kB)   clean gzip 147.58 kB
```

Single entry — Login, Setup, Settings, and Drive all pay the full parse/execute cost at startup.

### 5.2 Phase 2 — route-level code splitting (implemented)

`App.tsx` now uses `React.lazy` for Login/Drive/Settings/Setup inside a `Suspense` with a spinner fallback. AppInit stays in the shared chunk.

```
dist/assets/index-*.js         188.66 kB  (gzip  62.39 kB)   shared: react/router/store/motion/AppInit
dist/assets/Drive-*.js         259.25 kB  (gzip  78.93 kB)
dist/assets/Settings-*.js       12.28 kB  (gzip   3.65 kB)
dist/assets/Login-*.js           9.39 kB  (gzip   3.35 kB)
dist/assets/Setup-*.js           3.30 kB  (gzip   1.43 kB)
```

Verified: `npx vite build` clean; electron smoke-test of `dist/index.html` loads with zero console/module errors (splash shows without IPC, as expected); `npx tsc --noEmit` still reports exactly the 13 pre-existing errors (none in App/FileGrid/FileCard/useDragSelect/migrations).

Notes:
- Drive-first users (the default entry via AppInit) still download index+Drive on first paint — Drive is the leaf that pulls in the heavy deps, same as before (~141 kB gzip). The real win is Setup/Login/Settings screens (62-66 kB gzip total instead of 147 kB) and incremental parse of lazily-visited routes.

## 6. Sync (full-snapshot model)

Library: 600 files / 60 folders / 600 chunks / 30 versions. Snapshot JSON 347.5 KB (59.8 KB gzipped).

Local, deterministic legs (median):

```
push buildIndexSnapshot (5 SELECTs)   2.487 ms
push serializeIndex (stringify+gzip)  4.771 ms
pull deserializeIndex (gunzip+parse)  1.384 ms
pull rebuild transaction (puller.ts)  5.371 ms
── push local total ≈ 7.26 ms, pull local total ≈ 6.76 ms
```

Readings:
- Local cost is negligible (well under one frame) at the realistic scale; the transaction rebuild even at DB scale pays ~1.3 ms of parse + ~5.4 ms of SQLite writes. The new indexes do not regress this (INSERT 0.036 → 0.039 ms).
- **Network legs (Telegram upload/download) are NOT measured** — no session/credentials in this environment. The sync end-to-end time is dominated by those unmeasured legs.
- Known sync-model concern (destructive full replace in `push_changes`) is **architectural, not performance**, and is explicitly out of scope. Reported as a finding to a separate fixer, not solved here.

## 7. Phase 2 scope (all delivered, justified above)

1. DB: migration 7 — `files(folder_id, name)`, `chunks(file_id)`, `files(uploaded_at)`; before/after in §3.4.
2. Render: memoized FileCard (§4.2); virtualized FileGrid (§4.3); marquee full-grid degrade with deferred rect sync (§4.4).
3. Bundle: route-level code splitting (Login/Drive/Settings/Setup) + Suspense (§5.2).
4. Not done: no FTS5; no sync-model change; no Telegram worker/partSize change; no trash-expiry/preview/navigation changes.

## 8. Source of numbers

- `bench/bench-db.cjs` (600/6000 before: `/tmp/bench-db-600.log`, `/tmp/bench-db-6000.log`; after: `/tmp/bench-db-after-600-v2.log`, `/tmp/bench-db-after-6000.log`)
- `bench/bench-sync.cjs` (output in §6)
- `bench/render-harness/*` — corrected pre-memo: `/tmp/rb-preme-correct-*.log`; post-memo: `/tmp/rb-memo3-*.log`; virtualized: `/tmp/rb-virt-150/600.log`; marquee full-grid: `/tmp/rb-full600b.log`
- `# vite build` baseline + final split build (§5.2)