# TeleVault — FACTS FOR THE WEBSITE

**Date:** 2026-11-17 · **Branch:** `release/packaging` · **Version in tree:** `0.1.0` (`package.json`)

Every claim below is marked **CONFIRMED** (with the file and line proving it) or **NOT FOUND** (the claimed behaviour does not exist in this tree). Do not upgrade a NOT FOUND to a marketing claim without a code change.

## 1. Encryption

| Website statement | Status | Evidence |
|---|---|---|
| File contents are encrypted before upload, on the user's device | **CONFIRMED** | `core/crypto/encrypt.ts:4,8-14`; `core/telegram/uploader.ts:213-220` encrypts to a temp file *before* `getChunks()` at `:244` |
| Algorithm is AES-256-GCM with a random 12-byte IV and 16-byte auth tag | **CONFIRMED** | `core/crypto/encrypt.ts:4-6,9-13` |
| Decryption happens on download, locally | **CONFIRMED** | `core/telegram/downloader.ts:198` |
| The key is 32 random bytes held in the OS keychain (service `televault`, account `encryption-key`) and is never uploaded | **CONFIRMED** | `core/crypto/keystore.ts:4-16`; `core/crypto/secure-store.ts:43` |
| The key is derived from the user's password, or can be recovered by TeleVault | **NOT FOUND** | `core/crypto/keystore.ts:7-20` — random key, no escrow or recovery path |
| File **names, paths, MIME types and sizes** are encrypted too | **NOT FOUND** | They are written in plaintext JSON into the Telegram message caption: `core/telegram/uploader.ts:44-54,72-73,271,294`; and into local SQLite: `core/db/schema.ts:15-19` |
| The Telegram session is encrypted by the app at rest | **NOT FOUND** | Stored as a plain setting string `telegram_session`: `core/telegram/client.ts:183-187`; DB at `core/db/db.ts:11` |

**Safe wording:** "File contents are encrypted on your device with AES-256-GCM. The key stays in your OS keychain. File names and metadata are not encrypted."  
**Unsafe wording:** "All your data is encrypted" or "we can't see anything" — names/paths are plaintext in captions.

## 2. Where data lives

| Website statement | Status | Evidence |
|---|---|---|
| File metadata is stored locally in a SQLite database | **CONFIRMED** | `core/db/db.ts:11` (`<userData>/televault.db`); `core/db/schema.ts:2-30` |
| File contents are stored in the user's own Telegram account, in three dedicated channels (Storage / Index / Trash) | **CONFIRMED** | `core/telegram/uploader.ts:195,248,294`; `electron/ipc/files.ipc.ts:364-372`; channel init log path `core/telegram/channels.ts` |
| A TeleVault-hosted cloud server stores files or metadata | **NOT FOUND** | Only `dist/**/*`, `dist-electron/**/*`, `package.json` are packaged (`electron-builder.yml:9-13`); no license-server URL in the extracted asar |
| All app data is under the OS app-data directory, not the install folder | **CONFIRMED** | `app.getPath('userData')` used for DB (`core/db/db.ts:11`), temp chunks (`core/fs/chunker.ts:42`), preview cache (`electron/ipc/files.ipc.ts:410`), thumbnails (`:462`), avatars (`electron/ipc/system.ipc.ts:75`) |

## 3. Telegram authentication

| Website statement | Status | Evidence |
|---|---|---|
| Login is with a **user** Telegram account over MTProto (GramJS), not a bot | **CONFIRMED** | `core/telegram/client.ts:1-2,89-97`; `core/telegram/auth.ts:124-148` (`sendCode` → `signIn`) |
| The user supplies their own `api_id` and `api_hash` | **CONFIRMED** | `core/telegram/client.ts:38-43`; `src/pages/Setup.tsx:39,88,98` |
| TeleVault ships shared/bundled API credentials | **NOT FOUND** | `.env` is untracked and not in `electron-builder.yml:9-13`; first run collects credentials in `Setup.tsx` |

## 4. Features

| Website statement | Status | Evidence |
|---|---|---|
| Drag-and-drop upload | **CONFIRMED** | `src/components/upload/DropZone.tsx:61`; `src/pages/Drive.tsx:387` |
| Folders | **CONFIRMED** | `core/db/schema.ts:2`; `src/components/files/FolderCard.tsx` |
| Search | **CONFIRMED** | `electron/ipc/files.ipc.ts:336` (`files:search`) |
| In-app image, video and PDF preview | **CONFIRMED** | `src/components/files/FilePreview.tsx:26-29,48-51` |
| Markdown/code text preview | **CONFIRMED** | `src/components/files/FilePreview.tsx:106-107` |
| Chunked uploads (512 MiB chunks) | **CONFIRMED** | `core/fs/chunker.ts:8,86-91` |
| Resumable transfers (resume a partial upload from byte offset) | **NOT FOUND** | `core/telegram/ratelimit.ts` `withRetry` retries a whole chunk; no byte-offset resume exists |
| Hard 1.9 GB per-file limit advertised | **NOT FOUND** | `MAX_FILE_SIZE` is declared at `core/telegram/uploader.ts:26` but never referenced |
| Version history UI | **NOT FOUND** | Backend exists (`electron/ipc/files.ipc.ts:376-385`) but UI is "Version history — coming soon" (`src/components/files/ContextMenu.tsx:172`) |
| Tags | **NOT FOUND** | `src/components/layout/Sidebar.tsx:226` ("Tags coming soon") |
| Public share links usable by non-users | **NOT FOUND** | `files:shareLink` returns a private-channel URL `https://t.me/c/<id>/<msg>` (`electron/ipc/files.ipc.ts:364-372`) |

## 5. Telemetry / phone-home

| Website statement | Status | Evidence |
|---|---|---|
| No analytics or crash-reporting SDK | **NOT FOUND** (i.e. none present) | No `sentry`/`posthog`/`analytics` dependency in `package.json`; no such import in `core/`, `electron/`, `src/` |
| Only outbound calls are Telegram and the update feed | **CONFIRMED** | Telegram via GramJS (`core/telegram/client.ts:97`); GitHub release feed `electron/updater.ts:40`, `electron-builder.yml:71-75`. `FilePreview.tsx:94` fetches a **local** `tvfile://` URL. `shell.openExternal` calls (`electron/main.ts:60,73`, `electron/ipc/license.ipc.ts:9`) are user-initiated link opens. |
| A license server is contacted at startup | **NOT FOUND** | 0 source references to `LICENSE_SERVER_URL` / `LICENSE_SERVER_SECRET`; see `docs/audit/02-license-gating.md` |

## 6. Supported platforms (as configured in code)

| Statement | Status | Evidence |
|---|---|---|
| Windows, macOS and Linux targets are configured | **CONFIRMED** | `electron-builder.yml:31-45,55-69` (`win/nsis`, `mac/dmg+zip`, `linux/AppImage+deb`) |
| RPM target is configured | **NOT FOUND** | `electron-builder.yml:55-57` lists only AppImage and deb |
| Electron 29 / Chromium renderer | **CONFIRMED** | `package.json` devDependency `electron: ^29.1.4`; `electron/main.ts:43` `BrowserWindow` |
| Native modules are bundled | **CONFIRMED** | `better-sqlite3`, `keytar`, `sharp` in `package.json`; `postinstall` runs `electron-rebuild` |
| macOS-specific window styling | **CONFIRMED** | `electron/main.ts:49` (`titleBarStyle: hiddenInset` on darwin) |

## 7. License / provenance

| Statement | Status | Evidence |
|---|---|---|
| Repository license is MIT | **CONFIRMED** | `LICENSE:1-3` — "MIT License / Copyright (c) 2026 TeleVault" |
| Forked from another project (attribution required) | **NOT FOUND** | `LICENSE` contains no upstream copyright; first commit `9351a85970af` is "Initial commit" by `hsay123`; no fork/attribution header in `README.md` |

## Unsafe claims to avoid until code changes

"All data encrypted", "unlimited storage", "public share links", "resumable uploads", "version history", "tags", "pro plan", "1.9 GB file limit", "notarized / signed builds" (builds are currently unsigned — see `docs/RELEASE_HANDOFF.md`, TBD after first CI run).
