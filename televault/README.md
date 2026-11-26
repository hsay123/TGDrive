# ⚡ TeleVault

> Your Telegram account as a real cloud drive.

TeleVault is a desktop app that uses your Telegram account as cloud storage — with real
nested folders, client-side encryption, cross-device sync, and file versioning (in progress).
No monthly storage bills: your files, your Telegram, your control.

**Looking to contribute?** Jump to [Contributing](#contributing) for the repository layout,
per-OS setup, the development loop, and the clean-PR workflow.

---

## Features

- **Real nested folders** — not flat channel lists
- **Chunked uploads** — large files auto-split at 512 MiB
- **Client-side AES-256 encryption** — file contents encrypted before upload
- **Cross-device sync** — access your drive from any device
- **File version history** — coming soon
- **Media preview** — images, video, audio, PDF in-app
- **30-day trash** — restore accidentally deleted files
- **Zero storage cost** — Telegram hosts everything for free

---

## Install

[Download for Windows (.exe)]() · [Download for macOS (.dmg)]() · [Download for Linux (.AppImage)]()

*(Download links will be added here after the first GitHub Release.)*

---

## Known issues in this beta

- **Encryption key loss is permanent.** If you lose the key stored in your OS keychain, encrypted files cannot be read. This beta cannot export or import a recovery key, and encryption is disabled when no secure key store is available (e.g. Linux without a keyring). Only enable encryption if you can keep the key safe.
- **"Delete permanently" does not remove every trace.** It deletes the file's recorded Telegram messages and local database records, but cached thumbnails, old sync snapshots and archived version messages remain.
- **Sync is last-writer-wins.** A device with an older index can overwrite newer local metadata on pull. A local DB backup is taken before each full replace, but per-item conflict resolution is not implemented yet.
- **Trash expiry leaves orphaned Telegram data.** After 30 days the local references are purged at startup and daily, but the underlying messages are left in your Telegram account. Once the local pointers are gone, TeleVault can no longer find or delete those messages; they keep using your Telegram storage until you remove them manually.
- **Permanent delete leaves traces.** Cached thumbnails on disk, old sync snapshots in the Index channel and archived version messages are not removed when a file is permanently deleted.
- **Snapshots exported by v0.1.0-rc.1 cannot be recalled.** Early snapshots were compressed JSON that included your session string, API hash and other account metadata. The app cannot find or delete those old messages; if you used rc.1, read `docs/SECURITY.md` before trusting those channels.
- **OS warnings are expected.** Builds are not notarized, so Windows SmartScreen and macOS Gatekeeper will warn on first launch.
- **Version history and tags are not available yet**, and share links only work for users who can access your private Telegram channels.

---

## Quick Start

### 1. Get Telegram API credentials

1. Go to [my.telegram.org/apps](https://my.telegram.org/apps)
2. Sign in with your Telegram account
3. Click "Create new application"
4. Copy your **API ID** and **API Hash**

These are free and personal to your account. TeleVault uses them to connect as a Telegram client
(not a bot) so you get the full storage quota.

### 2. Install and run

Download the installer for your platform, or [build from source](#build-from-source):

```bash
git clone https://github.com/hsay123/TGDrive.git
cd TGDrive/televault
npm install
cp .env.example .env
# Edit .env: add your TELEGRAM_API_ID and TELEGRAM_API_HASH
npm run dev
```

> The app lives in the `televault/` subdirectory of the repository; GitHub
> Actions workflows live at the **repo root** in `.github/workflows/`.
> `.env` is read only in development — packaged builds collect API credentials
> on first run instead.

### 3. First launch

TeleVault creates **3 private channels** in your Telegram account automatically:

| Channel | Purpose |
|---|---|
| TeleVault Storage | All your uploaded files |
| TeleVault Index | Your folder tree (for cross-device sync) |
| TeleVault Trash | Deleted files (auto-purged after 30 days) |

These are regular private Telegram channels. You can see them in Telegram but shouldn't modify them manually.

---

## Privacy & Security

- TeleVault connects to Telegram as **your own user account** using API credentials you supply — not a shared bot.
- When encryption is enabled, **file contents** are encrypted on your device with AES-256-GCM before upload. The key is generated locally and stored in your OS keychain.
- **File names, paths, MIME types and sizes are not encrypted** — they are stored in the local SQLite database and in Telegram message captions. TeleVault is not zero-knowledge and does not provide metadata privacy.
- Your Telegram session, API ID and API Hash are stored in OS-protected storage (Electron `safeStorage`), not as plaintext in the app database. Index snapshots only carry the two sync preferences — credentials and private-channel identifiers are never uploaded.
- If no OS credential store is available (Linux with the `basic_text` backend, or a missing/unreachable keyring), TeleVault keeps the session in memory only and tells you so. You will need to sign in again next launch; there is deliberately no plaintext fallback. See `docs/SECURITY.md`.
- No analytics or crash reporting is included. The app contacts Telegram, and checks GitHub for updates.
- TeleVault is **not affiliated with Telegram**. Use it in accordance with [Telegram's Terms of Service](https://telegram.org/tos).

---

# Contributing

This section is the map for people working on the code. Run every `npm` command from
`televault/`, not from the repository root.

## Repository layout

```text
.
├── .github/workflows/        # CI + release; MUST be at repo root
│   ├── build.yml             # typecheck, tests, build:dir, smoke on 4 runners
│   └── release.yml           # tag-driven installers + draft GitHub release
├── assets/                   # root-level logos
└── televault/                # the whole Electron application
```

Inside `televault/`:

```text
televault/
├── .env.example              # template: TELEGRAM_API_ID, TELEGRAM_API_HASH (dev only)
├── package.json / lock       # scripts, dependencies; version 0.1.0-rc.2
├── vite.config.ts            # renderer dev server (:5173) → dist/
├── vitest.config.ts          # unit tests in tests/unit/**
├── tsconfig*.json            # renderer typecheck / main-process build / vite config
├── electron-builder.yml      # packaging, signing, publish provider
├── index.html                # Vite HTML entry
├── build/                    # entitlements plists; generated icons
├── electron/                 # PRIVILEGED main process (Node, native modules)
│   ├── main.ts               # entry point: DB → migration → IPC → window
│   ├── preload.ts            # contextBridge: window.televault.*
│   ├── types.ts              # canonical shared IPC/domain types
│   ├── security-migration.ts # one-time rc.1 credential migration
│   ├── updater.ts            # electron-updater (check/notify only)
│   └── ipc/                  # one handler module per domain
│       (auth, files, folders, settings, setup, sync, system, reveal, trash-expiry, …)
├── core/                     # framework-agnostic business logic
│   ├── db/                   # SQLite schema, migrations, per-table helpers,
│   │                         # settings allowlist, legacy-session-migration
│   ├── telegram/             # gramjs client, auth, channels, upload, download,
│   │                         # copy, rate-limit retry
│   ├── sync/                 # index snapshot build → push → pull (last-writer-wins)
│   ├── crypto/               # AES-256-GCM, keychain key, safeStorage credentials, PIN
│   ├── fs/                   # 512 MiB chunker, path tree, virtual filesystem
│   └── reveal-gate.ts        # in-memory hidden-file unlock
├── src/                      # React renderer (never imports Electron directly)
│   ├── main.tsx / App.tsx    # root + HashRouter shell (needed for file:// builds)
│   ├── pages/                # Setup, Login, Drive, Settings
│   ├── components/           # files, folders, upload, download, layout, shared
│   ├── hooks/                # upload, download, search, sync, auth, update, …
│   ├── store/                # Zustand: auth, files, folders, tree, upload, …
│   ├── lib/ / utils/ / types/
│   └── assets/               # source PNGs for npm run icons
├── scripts/                  # test runners + build helpers
│   ├── run-tests.mjs         # Vitest inside Electron's Node runtime (native ABI)
│   ├── smoke-test.mjs        # Playwright launch of a BUILT app, temp user-data-dir
│   ├── generate-icons.mjs / generate-checksums.mjs
│   └── merge-mac-update-metadata.mjs  # release workflow only
├── tests/unit/               # 15 Vitest files; no e2e tree
├── docs/                     # SETUP, SECURITY, TROUBLESHOOTING, QA, release, facts
└── bench/ / test-copy.js     # optional local benchmarks / ad-hoc diagnostic
```

Generated and **never committed**: `node_modules/`, `dist/`, `dist-electron/`,
`release/`, `.env`, `*.db`, `*.session`, `thumbnails/`, `build/icon.*`, local logs. The full
list is in `televault/.gitignore`.

## How the app works

1. **Start-up** — `electron/main.ts` opens `<userData>/televault.db`, runs the one-time
   rc.1 credential migration, ensures the root folder, registers IPC handlers, then creates
   the window. In dev it loads `http://localhost:5173`; packaged it loads `dist/index.html`
   via a `file://` URL, which is why routing is hash-based.
2. **Renderer ↔ main** — the renderer calls `window.televault.<domain>.<method>()`, exposed by
   `electron/preload.ts` with `contextIsolation: true` and `nodeIntegration: false`. Handlers
   live in `electron/ipc/*` and return `{ success, data?, error? }` via `helpers.ts`.
   **Never import `app`, `fs`, or native modules in `src/`.** Shared types live in
   `electron/types.ts` and are re-exported through `src/types/index.ts`.
3. **Storage** — SQLite in `<userData>/televault.db` (WAL mode) holds files, folders, chunks,
   versions, trash, settings and sync status. File bytes live as encrypted chunks in the
   user's own private Telegram channels.
4. **Sync** — `core/sync/indexer.ts` gzips folders/files/chunks plus an explicit settings
   allowlist (`core/db/settings-keys.ts`), `pusher.ts` uploads it to the Index channel, and
   `puller.ts` downloads the latest snapshot and replaces local rows. Do not add keys to
   that allowlist without a specific reason — credentials and channel access hashes must
   never cross the device boundary.
5. **Credentials** — Telegram session/API ID/API hash are in Electron `safeStorage`
   (`core/crypto/protected-store.ts`), the AES key and reveal PIN are in the OS keychain
   via keytar (`core/crypto/secure-store.ts`). There is no plaintext fallback.

App data directories: `%APPDATA%\TeleVault` (Windows), `~/Library/Application Support/TeleVault`
(macOS), `~/.config/TeleVault` (Linux).

## Set up on your device

### All platforms

| Tool | Use |
|---|---|
| **Node.js 22 LTS** | CI uses Node 22; README minimum is 20+, but match CI locally |
| **npm 10+** | bundled with Node 22 |
| **Git** | clone and branches |
| **Python 3.11** + C++ build tools | required by `node-gyp` for `better-sqlite3` and `keytar` |

Clone into a path **without parentheses or spaces** (for example `~/dev/TGDrive`). `npm ci`
inside a path containing `(Copy 2)` is known to break `node-gyp`.

```bash
git clone https://github.com/hsay123/TGDrive.git
cd TGDrive/televault
cp .env.example .env
# Fill in TELEGRAM_API_ID and TELEGRAM_API_HASH (development only)
npm install
```

`npm install` runs `postinstall` → `npm run rebuild`, which rebuilds native modules for the
installed Electron version. If it fails, run `npm run rebuild` manually.

### Windows

1. Install Node.js 22 LTS from nodejs.org and Git for Windows.
2. Install **Visual Studio Build Tools** → "Desktop development with C++" workload, and
   Python 3.11 (avoid Python 3.12+, where `distutils` was removed).
3. Follow the all-platform steps above, then `npm run dev`.
4. Packaging: `npm run build:win` produces an NSIS `.exe`. Unsigned builds trigger
   SmartScreen on first run.

### macOS

1. Install Node.js 22 LTS, then `xcode-select --install`.
2. Follow the all-platform steps above, then `npm run dev`.
3. `npm run build:mac` must run **on macOS**; it produces x64 and arm64 `.dmg`/`.zip`.
   Unsigned apps need Gatekeeper exceptions; see `docs/TROUBLESHOOTING.md`.

### Linux

1. Install Node.js 22 LTS and build tools:
   ```bash
   sudo apt install python3 python3-pip build-essential libsecret-1-0 gnome-keyring
   # Fedora/Arch: sudo dnf install libsecret ... / sudo pacman -S libsecret ...
   ```
2. Make sure GNOME Keyring or KDE Wallet is running. Without a keyring, sign-in is
   memory-only for the launch and encryption is unavailable — there is no plaintext fallback.
3. Follow the all-platform steps above, then `npm run dev`.
4. Packaging: `npm run build:linux` (AppImage + deb; rpm is CI-only). For headless smoke
   tests use `xvfb-run -a npm run test:smoke`.

## Everyday development

```bash
npm run dev                                   # Vite + tsc -w + Electron on :5173
npx tsc -p tsconfig.json --noEmit              # typecheck renderer + core + main
npx tsc -p tsconfig.electron.json --noEmit     # typecheck main-process build
npm test                                      # Vitest via Electron's Node runtime
npm run build:dir                             # unpacked build in release/ (fast packaging check)
xvfb-run -a npm run test:smoke                # Linux headless smoke (after a build)
```

`npm test` deliberately runs Vitest through Electron's Node runtime: native modules are
rebuilt for Electron's ABI, so plain host `node` cannot load them. `npm run test:smoke`
needs a prior build and launches the built app with a temporary user-data dir.

### Don't disturb the app while developing

- `npm run dev` uses your **real** `<userData>` folder. Use a dedicated test Telegram
  account, or a separate OS user/container, if you don't want development to touch your
  real drive, channels or session.
- Do not manually edit the three private Telegram channels; TeleVault owns their messages.
- Never commit `.env`, `*.db`, `*.session`, `protected-credentials.json`, backup files,
  logs, signing material (`*.pem`, `*.p12`, `*.pfx`, `*.key`) or generated `dist*/release/`.
- Tests must use fake, seeded values. Never put a real session, API hash, phone number or
  uploaded file into a test, log message, commit or issue.
- Prefer `git add <specific files>` over `git add -A` so generated files cannot slip in.

## How we work — clean PRs

1. **Start from fresh `main`.** `git fetch origin && git switch -c short-topic-name origin/main`.
   Never commit directly to `main`.
2. **One concern per PR.** Small, reviewable changes are merged in a deliberate order; do
   not bundle unrelated fixes into one branch.
3. **Target `main`.** CI runs on `pull_request` into `main` only. A PR into another feature
   branch gets no checks, so stacked PRs are avoided.
4. **Verify locally** before pushing: both typechecks, `npm test`, `npm run build:dir`, and
   the smoke test when packaging behaviour changed. Then `git diff --check`.
5. **Push a branch, open a PR.** `git push -u origin short-topic-name`, then open a PR with
   what changed, why, and how you verified it. Wait for all four CI runners to go green.
6. **No force-push, no history rewrite, no tags, no publishing.** Address review comments
   with new commits. Only maintainers create tags/releases, and releases start as drafts.
7. **Keep the boundaries.** `core/` stays framework-agnostic; privileged work belongs in
   `electron/ipc/*` behind `preload.ts`; new settings that cross devices must be reviewed
   against `core/db/settings-keys.ts`.

Before you push, this should all be true:

- [ ] Branch is based on the latest `origin/main`, not a stale local branch
- [ ] `git status` shows only the files you intend to change
- [ ] Both typechecks and `npm test` pass locally
- [ ] No credentials, logs, DB files, sessions or build output are in the commit
- [ ] PR targets `main`; CI is green on Windows, macOS (both arches) and Linux

Security issues go to a **private GitHub security advisory**, not a public issue; see
`docs/SECURITY.md`.

---

## Build from Source

Requirements: Node.js 20+, npm 10+ (Node 22 recommended to match CI).

```bash
npm install
cp .env.example .env
# Add TELEGRAM_API_ID and TELEGRAM_API_HASH (dev only)
```

| Command | Output |
|---|---|
| `npm run dev` | Dev server + Electron with HMR |
| `npm run build:dir` | Unpacked build in `release/` — fastest way to verify packaging |
| `npm run build:linux` | `TeleVault-x.y.z.AppImage` + `televault_x.y.z_amd64.deb` |
| `npm run build:win` | NSIS installer `.exe` |
| `npm run build:mac` | `.dmg` + `.zip` (x64 and arm64) |
| `npm run build` | Current platform, signed if certs are present |

All `build:*` scripts run `clean → icons → tsc → vite build` before packaging, so
`dist/` and `dist-electron/` are always rebuilt rather than reused from a stale
checkout. App icons are generated from `src/assets/blacklogo.png`:

```bash
npm run icons   # regenerates build/icon.{png,ico,icns}
```

> Do not use `electron-builder --win` directly. It packages whatever is already
> in `dist/` and `dist-electron/`, and both are gitignored — on a fresh checkout
> that produces an app with no `main.js`.

### Linux: libsecret is required

TeleVault stores your encryption key and hidden-folder PIN through keytar, and
your Telegram session/API credentials through Electron `safeStorage`. On Linux
both need a working keyring — **libsecret** plus a running **GNOME Keyring** or
**KDE Wallet** — or encrypted upload/download will fail and sign-in will only
last for the current launch:

```bash
sudo apt install libsecret-1-0    # Debian / Ubuntu
```

The `.deb` declares libsecret automatically. The AppImage cannot declare
dependencies, so it must be installed separately on the target machine. A
missing keyring is never silently replaced with plaintext storage; see
`docs/SECURITY.md` for the exact behaviour and recovery steps.

### Signing

Builds are unsigned by default, so Windows SmartScreen and macOS Gatekeeper will
warn on first launch. To sign, set these before building:

| Platform | Variables |
|---|---|
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD` |
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |

macOS also needs notarization credentials to clear Gatekeeper; see
`build/entitlements.mac.plist` for the hardened-runtime requirements.

### Releasing

Pushing a `v*.*.*` tag builds all three platforms via GitHub Actions
(`.github/workflows/release.yml`) and creates a **draft** GitHub release — a human
must review and click Publish; nothing goes public automatically. The release is
check-and-notify only: `electron-updater` looks for `latest*.yml` metadata at
`hsay123/TGDrive`, and downloads start only when the user asks. Change
`publish.owner` / `publish.repo` in `electron-builder.yml` if you fork this.

---

## Further reading

| Document | What it covers |
|---|---|
| `docs/SETUP.md` | Long-form dev setup and common errors |
| `docs/SECURITY.md` | Credential storage, rc.1 exposure notice, reporting |
| `docs/TROUBLESHOOTING.md` | Platform and runtime problems |
| `docs/QA_CHECKLIST.md` | Manual test matrix before a release |
| `docs/FOLLOW_UPS.md` | Known non-goals and planned work — a good place to pick an issue |
| `docs/RELEASE_PROCESS.md` / `docs/RELEASE_HANDOFF.md` | Release gates and handoff |
| `docs/FACTS_FOR_WEBSITE.md` | What is and is not true about encryption/privacy |

## Tech Stack

Electron · React · TypeScript · gramjs · better-sqlite3 · keytar · TailwindCSS · Vitest · AES-256-GCM

## License

MIT — see [LICENSE](LICENSE).
