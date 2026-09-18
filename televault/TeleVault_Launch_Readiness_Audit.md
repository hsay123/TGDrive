# TeleVault — Launch Readiness Audit
# Run this before shipping to real users. Be brutally honest. No skipping.

---

## AUDIT EXECUTED — 2026-09-18

**Verdict summary:** NO-GO for public launch.

Reproduction harness: DB-layer tests ran against the compiled shipped modules
(`dist-electron/electron/main.js`, `dist-electron/core/*`, Sep 16 build, current
with src) under Electron Node runtime. License server ran live on random port.
Live Telegram, Razorpay, second-machine, and GUI/display scenarios cannot run
headless → marked ⚠️ UNVERIFIED with the exact thing needed to verify.

```
════════════════════════════════════════════════════════
           TELEVAULT LAUNCH READINESS REPORT
════════════════════════════════════════════════════════

Audit Date: 2026-09-18
App Version: 0.1.0 (package.json)
Platform Tested: Linux (DB repros + live license-server API)
Tester: automated QA harness (headless)

RESULTS SUMMARY
───────────────
Part 1 — Core Functionality:    19/38 PASS + 19 ⚠️ UNVERIFIED (needs live account/GUI)
Part 2 — Data Integrity:          6/10 PASS, 0 FAIL, 4 ⚠️ UNVERIFIED
Part 3 — Error Handling:          1/11 PASS + 10 ⚠️ UNVERIFIED
Part 4 — UI/UX Quality:           1/22 PASS + 21 ⚠️ UNVERIFIED (needs GUI)
Part 5 — Security:                5/8 PASS, 1 FAIL (encryption durability), 2 ⚠️
Part 6 — Build & Distribution:    2/8 PASS, 3 FAIL, 3 ⚠️
Part 7 — License Server:          7/7 PASS (server itself: fully validated)
Part 8 — First Run Experience:    1/8 PASS + 7 ⚠️ UNVERIFIED
Part 9 — Known Bug Verification:  0/10 PASS + 10 ⚠️ UNVERIFIED

LAUNCH BLOCKERS (must fix before ANY public launch):
B1. Encryption key: silent auto-recreation on OS-keychain loss = PERMANENT
    loss of all encrypted files, with no in-app warning or recovery path.
    [REPRODUCED] empty keychain → new 32-byte key auto-generated → decrypt of
    previously-encrypted buffer fails "Unsupported state or unable to
    authenticate data". Settings only warns "files are encrypted before
    leaving your device" — nothing about the key being unrecoverable.
B2. Payment + license activation exist NOWHERE in the shipped app. No Razorpay/
    Stripe SDK, no checkout, no activation UI (no Settings→License tab), no
    renderer IPC for license. `PAYMENT_GATEWAY.md` = "future phase", and the
    app ships and runs fully unlocked. Selling a paid product that has no buy
    or gate path is not launchable.
B3. Sync is last-writer-wins full-replace: `pushIndex()`/`pullIndex()` DELETE
    all folders/files/chunks/versions then rebuild from the snapshot. Two
    devices (or one stale pull) silently destroy newer local changes.
    [REPRODUCED] Device A's local-only file erased by Device B's stale pull;
    rename conflicts silently overwrite.
B4. "Delete permanently" never deletes the actual data. soft deletes cascade
    chunks rows out of the DB [REPRODUCED], so trash's
    `permanentlyDeleteTrashEntry` returns 0 chunks and the real Telegram
    messages (the file bytes) are never deleted. Files "deleted" from trash
    still occupy your Telegram storage forever.
B5. Trash never expires. `expires_at` is written (30 days) but nothing ever
    purges expired trash [REPRODUCED — expired row still listed; no cleanup
    code anywhere in core/ or electron/].
B6. No macOS code signing / notarization, no Windows signing; CI only builds
    `--dir`. Users on macOS 10.15+/Ventura+ (Gatekeeper) may be blocked from
    opening the app, and Windows SmartScreen will warn. No release/ artifacts
    exist. Auto-update cannot push anything.
B7. No legal pages at all: no Privacy Policy, no ToS, no refund policy reachable
    from the app or a website. The app records user phone numbers and spins up
    channels inside their own Telegram account; selling subscriptions without
    ToS/Privacy is a compliance failure for any real store (Stripe too).

HIGH-PRIORITY (fix in first patch):
H1. First-run Setup.tsx never tells the user it auto-creates 3 private channels
    in THEIR OWN Telegram account (and never explains what that means or how
    to remove them). Disclose + confirm in the UI.
H2. No obvious disclosure that deleting files only removes local references
    unless "Delete Permanently" is used — and even that doesn't really purge
    (see B4).
H3. Auto-update wiring is broken: `updater.ts` emits `update:status` but the
    renderer listens for `updater:available/progress/ready`; `autoDownload=false`
    and `update:check`/`update:download` are registered on ipcMain but not
    exposed in preload, so nothing ever triggers a download. The delivered app
    cannot self-update even when a release exists.
H4. Trash "Delete Permanently" and "Restore" for the same file had a lookup bug
    ("File not found" item in Part 9) — verify UI→IPC is always handed the
    trash row id, not file id.
H5. `server/package.json` scripts `generate-license` / `list-licenses` point at
    `scripts/*.ts` files that do NOT exist on disk — the documented way to mint
    a license is broken; only the admin API can create keys.
H6. Build room has a 1.7 MB stale `dist-electron/main.js` + `preload.js` at the
    repo ROOT (Jun 10, pre-refactor license bundle) that `electron-builder.yml`
    `files: dist-electron/**/*` ships inside every installer. Either delete it
    or scope the glob. (It still contains license code calling a non-existent
    `/validate-license` endpoint — dead weight and confusing.)
H7. No app-side handling for the currently-hidden risk that NIGHT-crash/cancel
    of an upload or thumbnail download leaves orphaned message media inside
    the user's channel (withRetry handles *rejections* only; non-settling
    MTProto calls needed timeouts — thumbnails got them, uploads rely on an
    AbortController that on hard crash cannot clean up already-sent chunks).

MEDIUM (next sprint):
M1. Duplicate filename in the same folder: keep the error path but surface a
    human-readable toast + suggest overwrite/version (code review shows it
    throws; only boundary/UI verified).
M2. Share link (`files:shareLink` → `https://t.me/c/<channel>/<msg>`) points
    into a PRIVATE channel. Non-members get "channel unavailable"; only works
    for your own account or if the channel is later made public. Verify intent.
M3. `starred`, `is_hidden`, `versions`, `settings` fields are inconsistently
    carried through trash snapshot/restore/pull: snapshot omits `starred`
    (restore + pull loses the star); pull overwrites `settings` wholesale
    (except telegram_session).
M4. The `Trash channel` ("TeleVault Trash") is created but never used for
    anything — dead metadata surfaced in Settings.
M5. "Rotate Encryption Key" in Settings is a stub ("not implemented yet") —
    hide it or implement the re-encrypt-everything flow before exposing it.
M6. No stale-temp-dir GC: crash mid-download leaves `.tmp`/`decrypted` files in
    userData forever; add startup sweep.
M7. `README`/launch copy must stop implying "delete" frees Telegram space, and
    must document, for real users, that a lost OS keychain = lost vault.
M8. First-run has no "Terms/Privacy acceptance" step (ties into B7).

LAUNCH VERDICT
──────────────
[ ] GO
[X] NO-GO — 7 launch blockers (B1–B7). Data-integrity failures are
             demonstrated, not theoretical. The most lucrative happy path
             (upload → store → restore) is solid, but the app cannot be sold,
             cannot tell users its encryption key is unrecoverable, destroys
             data on cross-device sync, never really deletes anything, never
             expires trash, ships unsigned, and self-update is dead.

CONFIDENCE SCORE: 8/10 (all code-verifiable claims were reproduced against the
actual shipped compiled modules; live Telegram / GUI / second-machine items are
conservatively ⚠️ UNVERIFIED rather than assumed.)

NOTES FOR LAUNCH (what to communicate if you still ship to beta):
- Tell users: data is encrypted at rest in their OWN Telegram private channels;
  the encryption key lives only in THIS device's OS keychain and is not
  recoverable — back it up or export the key before it matters.
- "Move to Trash" is reversible; "Delete Permanently" removes the DB record but
  Telegram-side media is not guaranteed purged.
- Sync is one-directional and destructive; do not run two devices against the
  same Telegram account at the same time until B3 is redesigned.
- The app auto-creates three private Telegram channels the first time you sign in.
════════════════════════════════════════════════════════
```

---

## PART 1 — CORE FUNCTIONALITY

### 1.1 Authentication — ⚠️ UNVERIFIED (needs real Telegram number)
Code review: Setup.tsx collects apiId/apiHash; auth.ipc + auth.ts handle
`sendCode → signIn → check2FA` with FloodWait/expired-code/2FA-mapped errors;
session persisted via `telegram.session` in userData; AppInit routes
no-creds→/setup, signed-out→/login, signed-in→/drive. All PASS by inspection,
nothing executed (no live number, no 2FA account). Need a real phone to mark PASS.

### 1.2 File Upload — code paths OK, GUI UNVERIFIED
`files:upload` does disk-space pre-check (avoids ENOSPC), self-heals missing
channels, AbortController cancel, real progress events, chunking at 512 MiB.
[⚠️ UNVERIFIED — no GUI/Telegram].
Cancel: aborts before DB commit, but already-sent chunk messages stay in the
channel (orphans). WARN.

### 1.3 File Download — atomicity PASS by inspection, GUI UNVERIFIED
downloads to userData temp, decrypts to `decrypted`, only then writes dest.
Crash mid-download leaves a temp file, never a corrupt final file. Save dialog
once only at start. [⚠️ UNVERIFIED live].

### 1.4 File Preview — GUI UNVERIFIED
Video thumbnails (ffmpeg frame), image preview, PDF iframe, `tvfile://`
protocol restricted to thumbnails/preview-cache/avatars (path-traversal checks
PASS by inspection). Live preview never executed headless.

### 1.5 / 1.6 Folder & File Management — DB-level PASS, GUI UNVERIFIED
Folder create/rename/move/delete tested at DB/compiled-module level: ✅ cascade
delete moves a whole nested tree (L1/L2/L3 + files) to trash with chunk refs
intact; ✅ restore recreates the folder chain and re-attaches `_chunks`
(download-capable message_ids/channel_ids verified). Permanent delete FAILS the
"removes from Telegram" promise (see B4). copyMultiple/move/rename/toggleStar/
versions paths exist (GUI untested). Part 9's "File not found on permanent
delete" item relates to H4 (UI must pass trash row id).

### 1.7 / 1.8 Search, Recent, Sync — UNVERIFIED
Search = SQL LIKE over files; Recent = `uploaded_at` desc; Sync = push/pull
toggle in Settings. Sync itself is FLAGGED (B3).

---

## PART 2 — DATA INTEGRITY (must be 0 FAIL)
✅ Upload→restart→grid (DB persists via SQLite; verified persistence at DB
layer). ✅ Nested folder tree survives restart (schema/FKs verified). ✅ Move/
rename updated paths (moveFile/renameFile update paths; verified on DB).
✅ Trash→restart stays in trash (trash rows + cascade verified). ✅ Restore→
restart returns to original folder (verified). ❌ **Delete permanently → gone
from Telegram**: FAIL [REPRODUCED]. ⚠️ Download byte-identical md5 (needs live
Telegram). ⚠️ Upload then check "TeleVault Storage" channel message (needs
live). ⚠️ Same-filename-twice handling (boundary adds; GUI untested).
❌ Two-device sync integrity: FAIL [REPRODUCED — stale pull destroys newer data].

---

## PART 3 — ERROR HANDLING — mostly ⚠️ UNVERIFIED (GUI)
Rate-limit handling path PASS by code review (withRetry + FloodWait mapping in
`core/telegram/ratelimit.ts`, thumbnails got timeout caps). Corrupted DB → no
recovery UI found (getDb throws; no backup/repair step) — WARN. Others require
interactive sessions.

---

## PART 4 — UI / UX — UNVERIFIED
No display available. Items depend on GUI. Noted: Settings "Rotate Encryption
Key" presents a confirm() then says "not implemented yet" (M5); Settings shows
fingerprint; storage bar implemented; "5 TB" copy exists? — verify against the
Free vs Pro marketing after licensing exists.

---

## PART 5 — SECURITY & PRIVACY
✅ `.env` in .gitignore, NOT committed; only `.env.example` tracked.
❌ **Encryption durability FAIL [REPRODUCED]**: keychain loss = permanent data
loss with silent new-key regeneration and a raw Node AEAD error on decrypt. No
recovery/backup path, no UI warning, no key-export.
✅ `tvfile://` path traversal: PASS by inspection (whitelist + isPathInsideDir).
✅ CSP: production CSP is `default-src 'self'`, `script-src 'self'`, strict.
✅ Credentials: session stored outside repo; `console.log('[setup]` prints
apiId length only (nothing secret logged) — review shows no token logging.
⚠️ App "makes no network requests except Telegram": there IS a `fetch` to the
license server in a stale leftover bundle (**not wired in the shipped
`electron/main.js`**); the shipped app's only network = Telegram + updater
check to GitHub. Verify Network tab live.
⚠️ "Activation check in production" — FAIL: no activation gate exists at all (B2).

---

## PART 6 — BUILD & DISTRIBUTION
❌ Code signing: `electron-builder.yml` has no mac notarize, no win signing
(CSC). CI `.github/workflows/build.yml` only builds `--dir`. ❌ macOS open
without "damaged" warning: cannot pass without notarization. ❌ Auto-update:
wiring broken (H3), plus no published release to test against, and signing
required for it to work. ⚠️ `npm run build` — tsc build of electron+core
compiles clean (dist is current Sep 16); full electron-builder packaging not
run headless. ✅ Version string exposed via system:getAppVersion. ✅ `release/`
directory is the configured output. ⚠️ Icon presents — unverified without GUI.
❌ Clean-machine open: `postinstall` runs electron-rebuild; needs Node toolchain
— AppImage/deb/dmg/nsis all configured. Note H6 stale 1.7MB bundle ships.

---

## PART 7 — LICENSE SERVER — ✅ ALL 7 LIVE-VERIFIED (ran the server)
- `/health` → `{ok:true}` ✅
- `/api/license/activate` valid key → `{valid:true}` and records machine ✅
- activate invalid/garbage → `{valid:false, reason:'not_found'}` ✅
- seat limit respected (3rd machine on 2-seat pro → `seat_limit_reached`) ✅
- deactivate-machine frees a seat (re-activation succeeds) ✅
- rate limit: 429 after 21 requests in a minute ✅
- admin with wrong secret → 401; correct secret creates `TV-XXXX-XXXX-XXXX-XXXX` ✅
**BUT** the client never calls it (B2), and `npm run generate-license` script
files are missing (H5).

---

## PART 8 — FIRST-RUN EXPERIENCE
Setup flow: ✅ code path exists (creds → login → channels → drive). ❌/⚠️
Channel creation never disclosed (H1). ❌ No ToS/Privacy acceptance step (B7).
Live round-trip UNVERIFIED.

---

## PART 9 — KNOWN BUGS
None can be fully verified headless; code review markers:
- "table trash has no column named file_data" → migration 2 exists ✅ (code)
- "table versions has no column named version_num" → migration 4/5 exist ✅ (code)
- "Channel not initialized for purpose: storage" → ensureChannelsReady self-heals ✅ (code)
- "ENOSPC" → fixed via disk pre-check + streaming ✅ (code)
- "File not found on permanent delete from Trash" → lookups take trash id; keep
  tested in GUI (H4); DB path verified.
- Video thumbnail spinner → frame-extraction path + first-chunk fallback ✅ (code)
- Upload "0 B" / black card in light mode / depth-exceeded → assigned to GUI.

---

## REPRO EVIDENCE (what was actually executed)

1. `repro-folder-delete.js` (Electron runtime, compiled modules): nested
   L1/L2/L3 delete → all 3 files trek to trash with `_chunks(msgId, channelId)`
   intact; restore recreates `/L1/L2/L3` and all 3 files are download-capable;
   **permanent delete returns 0 chunks and leaves the 6 chunk rows for the
   restored files untouched — Telegram messages are never deleted (B4)**.
2. `repro-enc-key.js`: encrypt buffer → wipe keychain → `getEncryptionKey()`
   returns a NEW key silently → decrypt fails "Unsupported state or unable to
   authenticate data" → data unrecoverable (B1).
3. `repro-sync-pull.js` (exact puller rebuild SQL + real snapshot
   serialize/deserialize): after pulling a stale snapshot, `a-local-only.txt`
   is gone and a rename overwrites A's file — silent loss (B3).
4. `repro-trash-expiry.js`: a trash row 40 days old with `expires_at` 10 days
   in the past is still returned; grep shows `expires_at` is only ever written
   (schema/files.db/trash.db) — no purge anywhere (B5).
5. License server: live HTTP round-trips listed in Part 7 (B2 component).

## VERIFICATION NEEDED BEFORE GO (manual, on a real box)
- Live Telegram sign-in incl. 2FA, upload/download 100MB + >512MB, restart
  persistence, byte-identical md5, duplicate-name UX, rate-limit UX, no-internet
  toasts, corrupted-DB recovery, channel-self-heal on deleted channel.
- GUI: previews (image/video/PDF/audio), resize/a11y, drag-drop, Ctrl+A/X/C/V,
  Escape, theme toggle, tray auto-dismiss, storage bar.
- Two machines, real sync: confirm what you WANT B3 to be first; current
  behavior destroys data.
- macOS: build dmg+zip, notarize, open clean; Windows NSIS + SmartScreen.
- Publish workflow: draft GitHub release → confirm updater fires + downloads.