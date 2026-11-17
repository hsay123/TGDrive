# TeleVault — FACTS FOR THE WEBSITE

**Date:** 2026-11-17 · **Branch:** `release/packaging` · **Version in tree:** `0.1.0` (`package.json`)

Every claim below is marked **CONFIRMED** (with the file and line proving it) or **NOT FOUND** (the claimed behaviour does not exist in this tree). Do not upgrade a NOT FOUND to a marketing claim without a code change. Line numbers refer to this commit; re-check after edits.

## 1. Encryption — exactly what is and is not encrypted

| Website statement | Status | Evidence |
|---|---|---|
| **File contents** are encrypted before upload, on the user's device | **CONFIRMED** | `core/telegram/uploader.ts:213-220` encrypts a temp file with `getEncryptionKey()` *before* chunking at `:244`. Cipher: `core/crypto/encrypt.ts:4,8-14`. |
| Algorithm is AES-256-GCM with a random 12-byte IV and 16-byte auth tag | **CONFIRMED** | `core/crypto/encrypt.ts:4-6,9-13,21-22` |
| Decryption happens locally on download | **CONFIRMED** | `core/telegram/downloader.ts:198` calls `getEncryptionKey()` |
| The key is 32 random bytes in the OS keychain (service `televault`, account `encryption-key`), generated on-device, never uploaded | **CONFIRMED** | `core/crypto/keystore.ts:4-16`; `core/crypto/secure-store.ts:67-77` |
| The key is derived from a password, escrowed, or recoverable by TeleVault | **NOT FOUND** | `core/crypto/keystore.ts:14` (`crypto.randomBytes(32)`); no recovery path exists |
| **File name, path, MIME type and size are encrypted** | **NOT FOUND — they are PLAINTEXT** | Written as plaintext JSON into every Telegram message caption: `core/telegram/uploader.ts:44-54` (`CaptionMetadata`), `:72-73` (`JSON.stringify`), `:271,294`. Also stored in local SQLite in cleartext: `core/db/schema.ts:13-29` (`name`, `path`, `size`, `mime_type`). |
| Folder names / structure are encrypted | **NOT FOUND — PLAINTEXT** | `core/db/schema.ts:2-11`; synced via the Index channel (`core/sync/pusher.ts`) |
| Thumbnails are encrypted | **NOT FOUND** | Stored as local files `thumbnail_path` (`core/db/schema.ts:25`) and uploaded as separate Telegram messages |
| The **Telegram session** is encrypted by the app at rest | **NOT FOUND — PLAINTEXT** | Saved as the setting `telegram_session` via `persistSession()` at `core/telegram/client.ts:182-187`; read back at `:189-192`; SQLite DB at `core/db/db.ts:11`. No encryption wrapper is applied. |

**Safe wording:** "File *contents* are encrypted on your device with AES-256-GCM. The key stays in your OS keychain. File names, paths and metadata are **not** encrypted."

**Unsafe wording:** "All your data is encrypted", "zero-knowledge", "we can't see anything" — names/paths/MIME/size are plaintext in captions and local SQLite.

## 2. Where data lives

| Website statement | Status | Evidence |
|---|---|---|
| File metadata is stored locally in a SQLite database | **CONFIRMED** | `core/db/db.ts:11` (`path.join(app.getPath('userData'), 'televault.db')`); schema at `core/db/schema.ts:2-74` |
| File contents are stored in the user's own Telegram account in three private channels (Storage / Index / Trash) | **CONFIRMED** | `core/telegram/uploader.ts:195,248,294`; `electron/ipc/files.ipc.ts:364-372`; `core/telegram/channels.ts` |
| A TeleVault-hosted server stores files or metadata | **NOT FOUND** | Only `dist/**/*`, `dist-electron/**/*`, `package.json` are packaged (`electron-builder.yml:9-12`); no license-server URL in the extracted asar |
| All app data is under the OS app-data directory, never the install folder | **CONFIRMED** | DB `core/db/db.ts:11`; temp chunks `core/fs/chunker.ts:42`; preview cache `electron/ipc/files.ipc.ts:410`; thumbnails `:462`; avatars `electron/ipc/system.ipc.ts:75` |

**Concrete app-data locations** (product name `TeleVault`, Electron `app.getPath('userData')`): Windows `%APPDATA%\TeleVault`, macOS `~/Library/Application Support/TeleVault`, Linux `~/.config/TeleVault` (XDG).

## 3. Telegram authentication

| Website statement | Status | Evidence |
|---|---|---|
| Login uses a **user** Telegram account over MTProto (GramJS), not a bot | **CONFIRMED** | `core/telegram/client.ts:1-2,89-97`; `core/telegram/auth.ts:124-148` (`sendCode` → `signIn`) |
| The user supplies their own `api_id` and `api_hash` | **CONFIRMED** | `core/telegram/client.ts:38-43` (settings first, env fallback for dev); `src/pages/Setup.tsx:39,88,98` |
| TeleVault ships shared/bundled API credentials | **NOT FOUND** | `.env` is gitignored and not in `electron-builder.yml:9-12`; first run collects credentials in `Setup.tsx` |

## 4. Features

| Website statement | Status | Evidence |
|---|---|---|
| Drag-and-drop upload | **CONFIRMED** | `src/components/upload/DropZone.tsx:61`; `src/pages/Drive.tsx:387` |
| Folders | **CONFIRMED** | `core/db/schema.ts:2`; `src/components/files/FolderCard.tsx` |
| Search | **CONFIRMED** | `electron/ipc/files.ipc.ts:336` (`files:search`) |
| In-app image, video and PDF preview | **CONFIRMED** | `src/components/files/FilePreview.tsx:26-29,48-51` |
| Markdown/code text preview | **CONFIRMED** | `src/components/files/FilePreview.tsx:106-107` |
| Chunked uploads (512 MiB chunks) | **CONFIRMED** | `core/fs/chunker.ts:8,44,60` |
| Resumable transfers (byte-offset resume) | **NOT FOUND** | `core/telegram/ratelimit.ts` `withRetry` retries a whole chunk; no byte-offset resume |
| Hard 1.9 GB per-file limit advertised | **NOT FOUND** | `MAX_FILE_SIZE` declared at `core/telegram/uploader.ts:26` but never referenced |
| Version history UI | **NOT FOUND** | Backend exists (`electron/ipc/files.ipc.ts:376-385`); UI is "Coming soon" (`src/components/files/ContextMenu.tsx:172`) |
| Tags | **NOT FOUND** | `src/components/layout/Sidebar.tsx:226` ("Tags coming soon") |
| Public share links usable by non-users | **NOT FOUND** | `files:shareLink` returns a private-channel URL `https://t.me/c/<id>/<msg>` (`electron/ipc/files.ipc.ts:364-372`) |

## 5. Outbound network destinations (complete list)

| Destination | When | Evidence |
|---|---|---|
| **Telegram MTProto servers** | Login, channel setup, every upload/download/sync | `core/telegram/client.ts:89-97` (`new TelegramClient(...)`); auth `core/telegram/auth.ts:124-148`; uploader/downloader modules. This is the app's primary and intended network use. |
| **GitHub releases feed** (`github.com/hsay123/TGDrive`, via `electron-updater`) | Automatic check ~5 s after launch, plus manual "check for updates" click | `electron/updater.ts:37-41` (automatic) and `:86-90` (manual); provider/owner/repo at `electron-builder.yml:71-74`. No file content is sent — it is an update metadata request. |
| **OS browser via `shell.openExternal`** | Only when a link is clicked / a link-open IPC is invoked | `electron/main.ts:62,75` (window open + will-navigate) and `electron/ipc/setup.ipc.ts:7-9` (`system:openExternal`). User-initiated. |
| `tvfile://` local resource fetch | Preview rendering | `src/components/files/FilePreview.tsx:94` — **local**, not outbound. |

**NOT FOUND:** analytics, crash reporting, telemetry, a license server, or any payment endpoint. No `sentry`/`posthog`/`analytics` dependency in `package.json`; zero source references to `LICENSE_SERVER_URL` / `LICENSE_SERVER_SECRET` (see the local-only audit at `.local-audit/02-license-gating.md`). No local HTTP server exists in production (the orphaned `server/` tree was removed in this branch).

## 6. Keytar / OS credential store, and Linux with no keyring

| Statement | Status | Evidence |
|---|---|---|
| keytar is used via a lazy, cached wrapper | **CONFIRMED** | `core/crypto/secure-store.ts:18-55` — `require('keytar')` happens on first use (`:39-48`), not at module load; both the module and any failure are cached (`:20-21,36-37`). |
| It stores the AES key and the hidden-folder PIN | **CONFIRMED** | `core/crypto/keystore.ts:2,9,15,26,36,56` (account `encryption-key`); `core/crypto/reveal-pin.ts:2-21` (account `reveal-pin`); service `televault` in both. |
| On Linux, libsecret/keyring is required | **CONFIRMED** | `core/crypto/secure-store.ts:23-33` (`missingLibsecretHint`) and README "Linux: libsecret is required". The `.deb` declares `libsecret-1-0` at `electron-builder.yml:51-56`. |
| With no keyring, the app crashes at startup | **NOT FOUND — degrades gracefully** | keytar is loaded lazily (`secure-store.ts:35-42`), so the app starts normally. **Verified:** built app launched under xvfb with `DBUS_SESSION_BUS_ADDRESS` pointing at a nonexistent bus — `/setup` rendered with 0 console and 0 page errors (see `docs/QA_CHECKLIST.md`). |
| A missing libsecret library yields an actionable error | **CONFIRMED (require-time only)** | If `require('keytar')` throws (libsecret `.so` absent), the error is cached and wrapped with a Debian/Ubuntu install hint (`secure-store.ts:23-33,49-54`). `credentialStoreAvailable()` (`:58-65`) exposes a side-effect-free check. |
| An unreachable keyring daemon yields that same hint | **NOT FOUND — raw libsecret error** | If libsecret is installed but no secret service is reachable, `getSecret()` rejects with the underlying message. **Verified:** `Could not connect: No such file or directory`. Encrypted operations fail with that raw message; unencrypted use is unaffected. |

## 7. Supported platforms and minimum OS versions

Derived from the Electron version currently in the tree. **Verified** against the upstream Electron `README.md` "Platform support" section for the exact tag (`v29.1.4`), fetched 2026-11-17.

| Statement | Status | Evidence |
|---|---|---|
| Windows, macOS and Linux targets are configured | **CONFIRMED** | `electron-builder.yml:24-69` (`mac` dmg+zip `25-26`, `win` nsis `37-39`, `linux` AppImage+deb `58-61`) |
| RPM target is configured | **NOT FOUND** (to be added in Phase 4) | `electron-builder.yml:58-61` lists only AppImage and deb |
| Renderer is Electron (Chromium) | **CONFIRMED** | `electron: ^29.1.4` in `package.json`; `electron/main.ts:43` `BrowserWindow` |
| Native modules are bundled | **CONFIRMED** | `better-sqlite3`, `keytar`, `sharp` in `package.json`; `postinstall` runs `electron-rebuild`; `asarUnpack` at `electron-builder.yml:17-20` |

**Minimum supported OS versions for the current Electron 29:**

| OS | Minimum | Architectures | Source |
|---|---|---|---|
| Windows | Windows 10 and up | x64, arm64 | Electron v29.1.4 README, "Platform support" |
| macOS | Catalina (10.15) and up | x64, arm64 | Electron v29.1.4 README, "Platform support" |
| Linux | Ubuntu 18.04+, Fedora 32+, Debian 10+ (glibc-compatible distros) | x64, arm64 | Electron v29.1.4 README, "Platform support" |

> These minimums will be **re-verified and updated in the separate Electron-upgrade commit** planned after Phase 3. Electron 45 raises the macOS minimum to Ventura (13); do not publish the table above if the upgrade has landed.

## 8. License / provenance

| Statement | Status | Evidence |
|---|---|---|
| Repository license is MIT | **CONFIRMED** | `LICENSE:1-3` — "MIT License / Copyright (c) 2026 TeleVault" |
| Forked from another project (attribution required) | **NOT FOUND** | `LICENSE` has no upstream copyright; initial commit `9351a85970af` by `hsay123`; no attribution header in `README.md` |

## Unsafe claims to avoid until code changes

"All data encrypted", "zero-knowledge", "metadata privacy", "unlimited storage", "public share links", "resumable uploads", "version history", "tags", "pro plan", "1.9 GB file limit", "notarized / signed builds" (builds are currently unsigned — see `docs/RELEASE_HANDOFF.md`, TBD after the first CI run).
