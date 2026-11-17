# Follow-ups (not implemented in this release)

These are **deliberate non-changes** for `release/packaging`. The goal of this branch is a
packagable, auditable snapshot of the existing app — no new features, no behaviour changes,
no UI redesign. Each item below needs its own issue, test plan and commit.

## Security hardening

1. **Encrypt the stored Telegram session with Electron `safeStorage`.** Today the session
   string is a plaintext value in the local SQLite DB (`core/telegram/client.ts:182-187`).
   Migrating it must preserve existing sessions (decrypt-on-read with fallback) or users get
   logged out. Note `safeStorage` also needs libsecret/kwallet on Linux, so the no-keyring
   path needs a decision first.
2. **Encrypt metadata / Telegram captions.** File names, paths, MIME types and sizes are
   plaintext in captions (`core/telegram/uploader.ts:44-54,72-73,271,294`) and local SQLite
   (`core/db/schema.ts:13-29`). Encrypting them breaks compatibility with already-uploaded
   files and the Index-channel sync format, so it needs a versioned migration.
3. **Enable the Chromium sandbox.** `webPreferences.sandbox` is currently `false`
   (`electron/main.ts:56`). `contextIsolation` is already `true` and `nodeIntegration`
   `false` (`:54-55`). The sandboxed preload must be re-tested because it calls
   `require('electron')`; flip only after the smoke test covers first-run login.
4. **Allowlist `shell.openExternal` / navigation.** `system:openExternal`
   (`electron/ipc/setup.ipc.ts:7-9`) and the window handlers (`electron/main.ts:62,75`)
   currently accept arbitrary URLs/schemes. Restrict to `https:` and a known host list.
5. **Tighten the production CSP.** The injected CSP
   (`electron/main.ts` `webRequest.onHeadersReceived`) still permits
   `http://localhost:5173` and `'unsafe-inline'`/`'unsafe-eval'` for dev convenience. Make
   the allowlist conditional on `!app.isPackaged`.
6. **Local server hardening is currently moot.** There is no local HTTP server in the
   shipped app (the orphaned `server/` tree was removed). If one is ever reintroduced: bind
   `127.0.0.1` only, use a random port + per-launch token, strict Origin checks, and never
   log secrets.

## Correctness / features (explicitly out of scope here)

7. **Byte-offset resumable uploads/downloads.** `withRetry` retries a whole 512 MiB chunk
   (`core/telegram/ratelimit.ts`); there is no resume-from-offset.
8. **Version history UI.** Backend IPC exists (`electron/ipc/files.ipc.ts:376-385`) but the
   context-menu action is "Coming soon" (`src/components/files/ContextMenu.tsx:172`).
9. **Tags UI** (`src/components/layout/Sidebar.tsx:226`) and public share links (currently a
   private `t.me/c/...` URL, `electron/ipc/files.ipc.ts:364-372`).
10. **Enforce or remove `MAX_FILE_SIZE`** — declared at `core/telegram/uploader.ts:26` but
    never referenced, so any per-file limit claim is currently untrue.

## Release engineering

11. **Electron upgrade** — Electron 29 is EOL; upgrade to a supported stable major in its
    own commit after Phase 3 tests (tracked separately in this branch's plan).
12. **Code signing / notarization** — Windows SignPath Foundation or Azure Trusted Signing;
    macOS Developer ID + notarization. Builds work unsigned; see `docs/RELEASE_HANDOFF.md`.
13. **macOS universal build** — attempt `universal` in CI; if native modules block it, keep
    the two-arch `arm64` + `x64` DMGs and record the reason (Phase 4 decision).
14. **Publish updated min-OS table** after the Electron upgrade — see
    `docs/FACTS_FOR_WEBSITE.md` section 7.
