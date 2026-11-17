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

11. **Electron upgrade — BLOCKED, needs its own project (attempted 2026-11-17, reverted).**
    Electron 29 is EOL; a jump to a supported major (e.g. 45.3.3) is **not mechanical** and
    was deliberately not forced onto this packaging branch. Evidence from the attempt:
    - `electron-rebuild@3.2.9`'s bundled `node-abi` cannot detect Electron 45's ABI 150
      (`Could not detect abi for version 45.3.3`), so native modules (`better-sqlite3`,
      `keytar`) cannot be rebuilt. Requires moving to `@electron/rebuild` / updated `node-abi`.
    - `electron-builder@24.13.3` predates Electron 45 and would need its own upgrade
      (v27 requires Node >= 22.12), plus a fresh native-module compatibility check.
    - Electron 30–45 contains multiple breaking changes (e.g. sandboxed preload globals,
      `ProtocolResponse.session = null`, various webPreferences renames) that each need a
      code review and smoke test, not a version bump.
    Re-attempted 2026-11-17 on a separate local branch `upgrade/electron-45` (commit c316e1f,
    NOT pushed): bumping to electron 45.3.3 + electron-builder 26.18.0 + @electron/rebuild 4.2.1
    resolves the ABI-detection problem, but `better-sqlite3@9.6.0` then fails to compile against
    Electron 45's V8 headers (`v8::Object::Set` signature change, ABI 150). `keytar` and `sharp`
    need the same compatibility check, plus the Electron 30-45 API review above. Stopped as
    non-mechanical per the upgrade criterion; 20 unit tests and four-runner smoke were not
    reached. This branch stays on Electron 29. Schedule the upgrade as its own project with
    native-module upgrades, API migration, full QA re-run, and a new min-OS table in
    `docs/FACTS_FOR_WEBSITE.md`.
12. **Code signing / notarization** — Windows SignPath Foundation or Azure Trusted Signing;
    macOS Developer ID + notarization (needs an `afterSign` hook + Apple credentials).
    Builds work unsigned; see `docs/RELEASE_PROCESS.md`.
13. **macOS universal build — evaluated and rejected (Phase 4 decision).** electron-builder
    24.13.3 does not document `universal` as a supported target arch, and the native addons
    (`keytar`, `better-sqlite3`, `sharp`'s per-arch `@img` binaries) cannot be reliably
    merged. The release therefore ships native `arm64` + `x64` DMGs built on matching
    runners. Revisit only after an electron-builder upgrade; see `docs/RELEASE_PROCESS.md`.
14. **Multi-arch macOS auto-update metadata** — each native DMG build emits its own
    `latest-mac.yml`. The release currently stages them but does not consolidate them
    into one arch-aware index, so `electron-updater` on macOS needs verification (or a
    merge step) before auto-update is claimed to work. Downloads are unaffected.
15. **Local RPM toolchain** — the dev host has RPM 6, which bundled fpm 1.9.3 cannot target.
    CI `ubuntu-latest` (RPM 4.x) builds the `.rpm`; consider upgrading electron-builder/fpm
    if local RPM builds are ever required.
16. **Publish updated min-OS table** after the Electron upgrade — see
    `docs/FACTS_FOR_WEBSITE.md` section 7.
17. **Make updates strictly notify-only (proposed, not implemented).** The app
    already sets `autoDownload = false`; also set `autoInstallOnAppQuit = false`
    and make the 5-second automatic check opt-in, so a user sees "vX available"
    and explicitly chooses check / download / restart. Facts and evidence are in
    `docs/FACTS_FOR_WEBSITE.md` section 5a. No code change was made here.
18. **Keep the Windows first-run smoke honest.** The strict smoke now installs
    the real NSIS installer into a path with a space and launches the installed
    `TeleVault.exe` with `TELEVAULT_SMOKE=1` (PR #6). Diagnostics are gated on that
    variable and write `tv-smoke.log`; with it unset there is no behaviour
    change. Do not reintroduce an advisory/`continue-on-error` step.

## Deferred launch blockers (IDs only)

Full findings stay in `TeleVault_Launch_Readiness_Audit.md`; this is only a
status index, not a copy of the audit.

| ID | Short label | Status |
|---|---|---|
| B1 | Encryption key has no recovery path | Open — separate project |
| B2 | Payment / license activation | Accepted out of scope (Gate 1: free and open source) |
| B3 | Last-writer-wins full-replace sync | Known issue — local DB backup now taken before each full replace; conflict resolution still needed |
| B4 | Permanent delete leaves Telegram data | Open |
| B5 | Trash never expires | Open |
| B6 | Unsigned / notarized builds | Deferred — see item 12 |
| B7 | Legal pages absent | Open — website work |

First-run and Linux keyring problems are documented in
`docs/TROUBLESHOOTING.md`.
