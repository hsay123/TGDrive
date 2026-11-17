# ⚡ TeleVault

> Your Telegram account as a real cloud drive.

TeleVault is a desktop app that uses your Telegram account as unlimited, free cloud storage —
with real nested folders, client-side encryption, cross-device sync, and file versioning.

No monthly storage bills. Your files, your Telegram, your control.

---

## Features

- **Real nested folders** — not flat channel lists
- **Chunked uploads** — upload files of any size (auto-splits at 1.9 GB)
- **Client-side AES-256 encryption** — files encrypted before upload (Pro)
- **Cross-device sync** — access your drive from any device (Pro)
- **File version history** — restore previous versions (Pro)
- **Media preview** — images, video, audio, PDF in-app
- **30-day trash** — restore accidentally deleted files
- **Zero storage cost** — Telegram hosts everything for free

---

## Download

[Download for Windows (.exe)]() · [Download for macOS (.dmg)]() · [Download for Linux (.AppImage)]()

*(Links go live after first GitHub Release)*

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
git clone https://github.com/yourname/televault
cd televault
npm install
cp .env.example .env
# Edit .env: add your TELEGRAM_API_ID and TELEGRAM_API_HASH
npm run dev
```

### 3. First launch

TeleVault will create **3 private channels** in your Telegram account automatically:

| Channel | Purpose |
|---|---|
| TeleVault Storage | All your uploaded files |
| TeleVault Index | Your folder tree (for cross-device sync) |
| TeleVault Trash | Deleted files (auto-purged after 30 days) |

These are regular private Telegram channels. You can see them in Telegram but shouldn't modify them manually.

---

## Pricing

TeleVault is free to use. Pro features require a license key.

| Feature | Free | Pro |
|---|:---:|:---:|
| Upload & download | ✅ | ✅ |
| Nested folder structure | ✅ | ✅ |
| Media preview | ✅ | ✅ |
| Files up to any size | ✅ | ✅ |
| AES-256 encryption | — | ✅ |
| Cross-device sync | — | ✅ |
| File version history | — | ✅ |
| Up to 3 devices | — | ✅ |

**To get a Pro license:** Email [hello@televault.app](mailto:hello@televault.app).
Pro is currently invite-only while we're in early access.

---

## Privacy & Security

- TeleVault connects to Telegram using **your own API credentials** — not a shared bot
- With encryption enabled, **files are encrypted on your device** before upload — Telegram cannot read them
- The TeleVault license server only stores your **email and license key** — nothing else
- TeleVault is **not affiliated with Telegram**

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

Push a `v*.*.*` tag to build and publish all three platforms via GitHub Actions
(`.github/workflows/release.yml`). `electron-updater` then serves updates to
installed copies. Note the updater points at `hsay123/TGDrive` — change
`publish.owner` / `publish.repo` in `electron-builder.yml` if you fork this.

---

## License Server (Self-hosting)

If you want to run your own license server:

```bash
cd server
npm install
cp .env.example .env
# Edit .env: set ADMIN_SECRET
npm run dev
```

Generate a license key:

```bash
npm run generate-license -- --tier pro --email user@example.com --lifetime
```

---

## Tech Stack

Electron · React · TypeScript · gramjs · better-sqlite3 · TailwindCSS · AES-256-GCM

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
