# TeleVault — QA checklist (Phase 3, local Linux)

**Date:** 2026-11-17 · **Branch:** `release/packaging` · **Runtime:** Node 22.23.2, electron 29.4.6, ABI 121 · **Host:** Linux x64 (Kali 7.0.12 kernel), xvfb available.

This is the reproducible test evidence for the packaging branch. Commands below are run from `televault/` unless stated. A check is only marked PASS when the command exited 0 or the assertion was observed directly.

## Results

| # | Check | Command / method | Result | Evidence |
|---|---|---|---|---|
| 1 | Clean dependency install from lockfile | `npm ci --ignore-scripts && npm run postinstall && node node_modules/electron/install.js` | PASS (with workaround) | A plain `npm ci` fails because `node-gyp` cannot handle the `(Copy 2)` in the checkout path (`Syntax error: "(" unexpected`). Workaround is environment-only: scripts skipped, `electron-rebuild` run explicitly, Electron binary restored via its installer. No app code changed. **CI paths have no parentheses, so plain `npm ci` is expected to work there — must be confirmed in Actions.** |
| 2 | Native modules load at the app's ABI | `ELECTRON_RUN_AS_NODE=1 electron -e "require('better-sqlite3'); require('keytar'); require('sharp')"` | PASS | All three `require()` calls succeeded under ABI 121. Node's ABI is 127, which is why tests run under Electron's runtime (see #4). |
| 3 | Renderer typecheck | `npx tsc -p tsconfig.json --noEmit` | PASS | Exit 0, no diagnostics. |
| 4 | Main/core typecheck | `npx tsc -p tsconfig.electron.json --noEmit` | PASS | Exit 0, no diagnostics. |
| 5 | Unit tests | `npm test` | PASS | 5 files, 20 tests passed: `crypto` 6, `chunker` 5, `uploader` 3, `migrations` 3, `userdata` 3. `npm test` runs vitest under Electron's Node via `scripts/run-tests.mjs` so native modules load. |
| 6 | Encrypt → decrypt round-trip (buffer + file) | `npm test` → `tests/unit/crypto.test.ts` | PASS after fix | Exposed a real hang in `encryptFile` (cipher never piped to output). Reproduction: 3 s watchdog → `TIMED_OUT`, only 28 header bytes written. Fixed in `689e544`. After fix: file round-trip passes in ~40 ms; tamper/wrong-key detection passes. |
| 7 | Chunk boundaries at 512 MiB | `npm test` → `tests/unit/chunker.test.ts` | PASS | Sparse 1.5 GiB file split into 2 descriptors with correct ranges; single-chunk path uses the original file; `assembleChunks` orders by index. |
| 8 | Uploader contract against mocked Telegram | `npm test` → `tests/unit/uploader.test.ts` | PASS | Correct gramjs `sendFile` options and caption pass-through; 0..1 progress mapped to 0..100; failure propagates. |
| 9 | SQLite migrations from empty / legacy DB | `npm test` → `tests/unit/migrations.test.ts` | PASS | Fresh schema, idempotent re-run, and repair of a `files` table missing `starred`. |
| 10 | userData location + plaintext session | `npm test` → `tests/unit/userdata.test.ts` | PASS | DB created under a mocked `app.getPath('userData')`, not cwd; `telegram_session` stored and read back as plaintext. |
| 11 | Unpacked Linux build | `npm run build:dir` | PASS | Exit 0. Output `release/linux-unpacked/televault`. `dist/` rebuilt from clean by `build:prepare`. |
| 12 | Packaged-app smoke test (first run) | `xvfb-run -a npm run test:smoke` | PASS | `/setup` rendered with "Welcome to TeleVault" and "API ID"; 0 console errors, 0 page errors; app closed cleanly. Isolated `XDG_CONFIG_HOME` forces first run. |
| 13 | No-keyring degradation | `DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/opencode/no-such-bus xvfb-run -a npm run test:smoke` | PASS for startup | App still renders `/setup` with 0 console/page errors. Separate direct check: `getSecret()` rejects with raw `Could not connect: No such file or directory` — **no install hint in the daemon-unreachable case** (FACTS corrected). |
| 14 | Bundle secret scan | gitleaks on working tree + extracted asar (`.local-audit/01-secrets.md`) | PASS | Extracted asar: 0 findings. Working tree findings were binary false positives; 2 history findings were placeholder values. No rotation needed — `.env` was never committed or bundled. |

## Not verifiable locally (by design)

| Item | Where it will be verified |
|---|---|
| Windows `.exe` build + first-run smoke | GitHub Actions `windows-latest` runner |
| macOS `.dmg` build(s) + first-run smoke | GitHub Actions `macos-latest` / `macos-15-intel` runners |
| macOS universal vs two-arch decision | GitHub Actions (native deps may block a universal build) |
| Code signing / notarization | GitHub Actions, only when the user supplies secrets (Gate 2 input) |
| Linux `.AppImage` / `.deb` / `.rpm` from the release workflow | Phase 4 local build + GitHub Actions |
| Clean `npm ci` on a parenthesis-free path | GitHub Actions |

## How to reproduce

```bash
cd televault
npm ci                       # on a path without parentheses
npm test                     # 20 unit tests
npm run build:dir            # unpacked Linux app
xvfb-run -a npm run test:smoke
```

Both typecheck commands are listed in the results table above; there is no combined `npm run typecheck` script yet (kept as-is to avoid unrelated package.json churn).

## Phase 4/5 — Linux installer artifacts (local)

| Artifact | Fixed name | Result | SHA-256 |
|---|---|---|---|
| AppImage (x64) | `TeleVault-linux-x64.AppImage` | PASS — 132 MiB, ELF x86-64 | `92f81f6212340d173b1737c937851dc588cea073baf0fdc0d2b16cf495549185` |
| Debian (x64) | `TeleVault-linux-x64.deb` | PASS — 89 MiB, deb 2.0 | `7568f29e7c1ed16691d134088ff11231259e2dd38e257c1a23ca69ecc00affba` |
| RPM (x64) | `TeleVault-linux-x64.rpm` | **Not buildable on this host** — see below | — |

- Built with `npm run build:prepare && electron-builder --linux AppImage deb --x64`. RPM is present in the committed config for CI but excluded from the local target list.
- `dpkg-deb -I` confirms `Package: televault`, `Version: 0.1.0`, `Architecture: amd64`, and `Depends: libsecret-1-0, libnotify4, libnss3` (the keytar/libsecret runtime deps).
- `sha256sum -c SHA256SUMS.txt` verifies both artifacts OK. `npm run checksums` regenerates it deterministically (sorted, sha256sum-compatible format).
- `asarUnpack` verified: `@img` and `sharp` native libs are present under `resources/app.asar.unpacked/node_modules/`, so thumbnails work when packaged.
- Smoke test re-run against this fresh unpacked build: PASS (0 console/page errors).

### Why RPM is CI-only here

The host has **RPM 6.0.1**; electron-builder 24.13.3 uses its bundled **fpm 1.9.3**, which targets RPM 4.x. A minimal `fpm -s dir -t rpm` package (no TeleVault files) fails identically, proving it is a host toolchain incompatibility, not our config. Two distinct RPM 6 breakages were reproduced:

1. RPM 6 uses a sqlite DB at `/var/lib/rpm` (not writable as this user); worked around locally via a throwaway `~/.rpmmacros` dbpath.
2. RPM 6 derives the buildroot as `<name>-<version>-build/BUILDROOT`, which fpm 1.9.3 does not stage into — `rpmbuild` reports `File not found` for a file that was staged at the exact path it names. Patching the cached fpm to stage into RPM 6's layout still failed.

**Resolution:** no repo files were changed for these experiments; the cached fpm was restored to its original state and the local `~/.rpmmacros` removed. The `rpm` target stays in `electron-builder.yml`. GitHub Actions `ubuntu-latest` ships RPM 4.x, where fpm 1.9.3 builds `.rpm` correctly — the RPM artifact will be produced and smoke-tested there, not faked locally.
