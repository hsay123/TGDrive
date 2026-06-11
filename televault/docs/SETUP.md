# TeleVault — Developer Setup Guide

## Prerequisites

| Tool | Minimum | Check |
|------|---------|-------|
| Node.js | 20.x | `node --version` |
| npm | 10.x | `npm --version` |
| Git | any | `git --version` |
| Python | 3.x | `python3 --version` (needed for `node-gyp` / native modules) |

On Ubuntu/Debian, install Python and build tools:
```bash
sudo apt install python3 python3-pip build-essential
```

On macOS, install Xcode command-line tools:
```bash
xcode-select --install
```

---

## Step 1: Clone the repository

```bash
git clone https://github.com/yourname/televault
cd televault
```

---

## Step 2: Get Telegram API credentials

TeleVault connects to Telegram on your behalf using your personal API credentials (not a bot token). This gives you the full MTProto storage quota.

1. Open your browser and go to: **https://my.telegram.org/apps**
2. Enter your phone number **with country code** (e.g. `+91 98765 43210`)
3. Telegram will send a login OTP to your Telegram app — enter it
4. Click **"API development tools"**
5. Fill in the form:
   - **App title**: `TeleVault`
   - **Short name**: `televault`
   - **Platform**: `Desktop`
   - **Description**: (optional) `Personal cloud drive`
6. Click **"Create application"**
7. You will see:
   - **App api_id** — a number like `1234567`
   - **App api_hash** — a hex string like `a1b2c3d4e5f6...`
8. Copy both values — you'll need them in the next step

> ⚠️ Keep your api_id and api_hash private. Do not commit them to git.

---

## Step 3: Environment setup

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
TELEGRAM_API_ID=1234567          # ← your api_id from step 2
TELEGRAM_API_HASH=a1b2c3d4e5f6   # ← your api_hash from step 2
```

Leave everything else as default for local development.

---

## Step 4: Install dependencies

```bash
npm install
```

This also runs `electron-rebuild` automatically (via `postinstall`) to compile native modules (better-sqlite3, keytar) for your Electron version.

> If rebuild fails, run manually: `npm run rebuild`

---

## Step 5: Run in development mode

```bash
npm run dev
```

This starts three processes concurrently:
1. **Vite** — React renderer on `http://localhost:5173`
2. **tsc -w** — TypeScript watcher for Electron main process
3. **Electron** — waits for Vite to be ready, then opens the app window

You should see the TeleVault window open within ~5 seconds.

---

## Step 6: Set up the license server (optional for dev)

In a separate terminal:

```bash
cd server
npm install
cp .env.example .env
# Edit server/.env: set ADMIN_SECRET to any string
npm run dev
```

Seed test license keys:

```bash
ts-node scripts/seed-dev.ts
```

This prints two test keys (Pro + Team) you can enter in Settings → License.

---

## Common Issues

### `Cannot find module 'better-sqlite3'`

Native modules need to be rebuilt for your Electron version:

```bash
npm run rebuild
```

### `Cannot find module 'keytar'`

Same fix — rebuild native modules:

```bash
npm run rebuild
```

### `app is not defined` in renderer

You're importing Electron's `app` module in the renderer process. It's only available in the main process (`electron/main.ts`). Use IPC (`window.televault.*`) to communicate from the renderer.

### `FloodWaitError 60` from Telegram

Telegram is rate-limiting your account. Wait the specified number of seconds and try again. This happens if you've made many requests in a short time (common during development when restarting frequently).

### `SESSION_REVOKED` or `Session string invalid`

Your Telegram session has been revoked (e.g., you logged out from Telegram on another device with "terminate all sessions").

Fix: Open Settings → Account → Sign Out, then log in again.

Or manually clear the session DB:
```bash
# macOS
rm ~/Library/Application\ Support/TeleVault/settings.db

# Linux
rm ~/.config/TeleVault/settings.db

# Windows
del %APPDATA%\TeleVault\settings.db
```

### Blank screen in Electron window

Vite may not be ready yet. The `wait-on` in the dev script handles this, but if it fails:

1. Make sure Vite started successfully (check the terminal output)
2. Try opening `http://localhost:5173` in your browser — if it works there, Electron should too
3. Open DevTools in Electron: View → Toggle Developer Tools

### TypeScript errors after `npm install`

Run a full type check to see what's wrong:

```bash
npx tsc --noEmit
```

---

## Building for Production

```bash
npm run build         # all platforms (if on the right OS)
npm run build:mac     # macOS .dmg (must run on macOS)
npm run build:win     # Windows .exe (can cross-compile from Linux/macOS)
npm run build:linux   # Linux .AppImage (must run on Linux)
```

Output goes to `release/`.

---

## Project Structure

```
televault/
├── electron/          # Electron main process (Node.js)
│   ├── main.ts        # Entry point, window creation
│   ├── preload.ts     # Context bridge (renderer ↔ main IPC)
│   ├── updater.ts     # Auto-update logic
│   └── ipc/           # IPC handlers by domain
├── core/              # Business logic (no Electron/React deps)
│   ├── db/            # SQLite local database
│   ├── telegram/      # gramjs auth + upload/download
│   ├── vfs/           # Virtual filesystem operations
│   ├── crypto/        # AES-256-GCM encryption
│   └── sync/          # Cross-device sync engine
├── src/               # React renderer
│   ├── pages/         # Route-level components
│   ├── components/    # Shared UI components
│   └── stores/        # Zustand state stores
├── server/            # License validation server
│   ├── db/            # Server SQLite (licenses.db)
│   ├── routes/        # Express routes
│   └── index.ts       # Server entry point
├── scripts/           # CLI tools (generate-license, etc.)
└── docs/              # Documentation
```
