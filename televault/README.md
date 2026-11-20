# ⚡ TeleVault

> Your Telegram account as a real cloud drive.

TeleVault is a desktop app that uses your Telegram account as unlimited, free cloud storage —
with real nested folders, client-side encryption, cross-device sync, and file versioning.

No monthly storage bills. Your files, your Telegram, your control.

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
- **"Remove from TeleVault" does not delete from Telegram.** It removes the file from TeleVault only. Its data stays in your Telegram until you delete the messages there.
- **Sync is last-writer-wins.** A device with an older index can overwrite newer local metadata on pull. A local DB backup is taken before each full replace, but per-item conflict resolution is not implemented yet.
- **Trash expiry leaves orphaned Telegram data.** After 30 days the local references are purged at startup and daily, but the underlying messages are left in your Telegram account. Once the local pointers are gone, TeleVault can no longer find or delete those messages; they keep using your Telegram storage until you remove them manually.
- **Permanent delete leaves traces.** Cached thumbnails on disk, old sync snapshots in the Index channel and archived version messages are not removed when a file is permanently deleted.
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

**Download** the installer for your platform, or build from source:

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

TeleVault will create **3 private channels** in your Telegram account automatically:

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
- Your Telegram session is stored locally in the app-data database. It is not encrypted by TeleVault.
- No analytics or crash reporting is included. The app contacts Telegram, and checks GitHub for updates.
- TeleVault is **not affiliated with Telegram**. Use it in accordance with [Telegram's Terms of Service](https://telegram.org/tos).

---

## Build from Source

Requirements: Node.js 20+, npm 10+

```bash
npm install
cp .env.example .env
# Add TELEGRAM_API_ID and TELEGRAM_API_HASH
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

TeleVault stores your encryption key and the hidden-folder PIN in the OS
credential store. On Linux that means **libsecret** must be installed, or
encrypted upload/download will fail:

```bash
sudo apt install libsecret-1-0    # Debian / Ubuntu
```

The `.deb` declares this dependency automatically. The AppImage cannot declare
dependencies, so it must be installed separately on the target machine.

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

## Tech Stack

Electron · React · TypeScript · gramjs · better-sqlite3 · TailwindCSS · AES-256-GCM

---

## Contributing

See [docs/SETUP.md](docs/SETUP.md) for development setup and
[docs/RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) for the release handoff.

## License

MIT — see [LICENSE](LICENSE).
