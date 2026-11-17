# TeleVault — release process & Gate 2 handoff

**Branch:** `release/packaging` (pushed to `origin/release/packaging`) · **Status:** Gate 2
delivered and branch pushed. No tag, release, publish, or history rewrite has been
performed. See `docs/QA_CHECKLIST.md` for CI results. The strict Windows
first-run smoke must be green on all four runners before a release is cut;
its installed-exe rework is tracked in PR #6.

## Final artifact list

These are the exact, fixed names the release pipeline produces. `SHA256SUMS.txt` is
generated once, after all platform artifacts are staged together.

| Artifact | Produced by (runner) | Verified locally? |
|---|---|---|
| `TeleVault-windows-x64.exe` | `windows-2022` (x64) | No — Windows-only build; first-run smoke runs in CI on the installed exe (PR #6) |
| `TeleVault-macos-x64.dmg` | `macos-15-intel` (Intel) | No — macOS-only build; smoke-tested in CI |
| `TeleVault-macos-arm64.dmg` | `macos-latest` (arm64) | No — macOS-only build; smoke-tested in CI |
| `TeleVault-linux-x64.AppImage` | `ubuntu-latest` (x64) | **Yes** — built, hashed, smoke-tested |
| `TeleVault-linux-x64.deb` | `ubuntu-latest` (x64) | **Yes** — built, metadata checked, hashed |
| `TeleVault-linux-x64.rpm` | `ubuntu-latest` (x64, RPM 4.x) | No — host has RPM 6 (see below) |
| `SHA256SUMS.txt` | `assemble` job (ubuntu-latest) | **Yes** — `sha256sum -c` passes for local artifacts |

Companion files (not installers, not in `SHA256SUMS.txt`): auto-update metadata
`latest.yml` / `latest-mac.yml` / `latest-linux.yml`, plus `.zip` files on macOS
(the Squirrel.Mac update payload). The macOS `.zip` is intentionally excluded
from the checksum file because it is not a published installer name.

### Why two macOS DMGs instead of one universal DMG

A single universal DMG was evaluated and rejected. Concrete blockers:

- electron-builder **24.13.3**'s documented `TargetConfiguration.arch` enum is
  `x64 | ia32 | armv7l | arm64` — `universal` is not a supported CLI/arch value
  in this version (its `mergeASARs` option references universal only in passing).
- The app's native modules are architecture-specific: `keytar` and `better-sqlite3`
  load `.node` binaries, and `sharp` uses per-arch `@img/sharp-*` packages. These
  cannot be reliably lipo'd into one universal app with this toolchain.

Therefore each DMG is built natively on its own matching runner. If a future
electron-builder upgrade makes universal reliable, the `mac` artifactName already
supports `TeleVault-macos-universal.dmg` — only the target config and workflow
matrix would change.

### Why the RPM is CI-only

The local host runs **RPM 6.0.1**; electron-builder 24's bundled **fpm 1.9.3**
targets RPM 4.x. A minimal fpm package with no TeleVault files fails identically,
so this is a host toolchain incompatibility, not an app or config error. GitHub's
`ubuntu-latest` ships RPM 4.x, where the `rpm` target builds correctly. No local
fpm patch or host config change was left behind (see `QA_CHECKLIST.md`).

## Workflow layout

Workflows were **moved from `televault/.github/workflows/` to repo-root
`.github/workflows/`** — GitHub does not discover workflows nested in a
subdirectory, so the old ones never ran. The old files were deleted, not kept
as duplicates.

- `.github/workflows/build.yml` — on push/PR to `main`, `develop`, `release/**`:
  typechecks, 20 unit tests, unpacked build, and a packaged-app smoke test on
  Ubuntu, Windows, macOS arm64 and macOS x64. All third-party Actions are pinned
  to commit SHAs.
- `.github/workflows/release.yml` — on `v*.*.*` tag push or manual dispatch:
  builds every installer, stages them, generates and verifies `SHA256SUMS.txt`,
  then creates a **draft** release. It never publishes automatically.

Runner labels were verified against GitHub's current hosted-runner reference on
2026-11-17: `macos-13` (retired 2025-12-04) and `macos-14` (retired 2026-11-02)
were rejected; `macos-15-intel` and `macos-latest` are used instead.

## OS-only verification

| Check | Local (Linux) | GitHub Actions |
|---|---|---|
| Typechecks + 20 unit tests | PASS | build.yml on all 4 runners |
| Unpacked build + smoke test | PASS | build.yml on all 4 runners |
| `.AppImage` / `.deb` build + metadata | PASS | release.yml |
| `.rpm` build | Blocked by RPM 6 host | release.yml on `ubuntu-latest` (RPM 4.x) |
| `.exe` build | Not possible locally | release.yml + `windows-2022` runner |
| `.exe` first-run smoke | Not possible locally | strict in CI on the installed NSIS exe (PR #6); must be green before release |
| `.dmg` (x64 + arm64) build + first-run smoke | Not possible locally | release.yml + macOS runners |
| Code signing / notarization | N/A | Only if signing secrets are supplied |

No Wine, no cross-compiled fake macOS/Windows builds, and no claimed behavior
without file/test evidence.

## Exact steps for the remaining work (in order)

1. **Review and push the branch** (user action — I have not done this):
   ```bash
   git push -u origin release/packaging
   ```
   Open a PR into `main`. CI (`build.yml`) must go green on all four runners.
   Confirm plain `npm ci` succeeds in CI (the local `(Copy 2)` path needed a
   workaround; CI paths have no parentheses).
2. **Signing inputs (optional; user decision).** Without these, artifacts are
   unsigned but still downloadable. To sign, add repo secrets:
   - macOS: `MAC_CERT_P12` (base64 .p12), `MAC_CERT_PASSWORD`
   - Windows: `WIN_CERT_P12` (base64 .p12), `WIN_CERT_PASSWORD`
   - Notarization, if desired, needs an `afterSign` hook + Apple credentials and
     is listed in `FOLLOW_UPS.md` (not implemented here).
3. **Dry run (no release touched):** in the Actions tab, run the `Release`
   workflow manually with `dry_run = true`. Download the
   `televault-release-bundle` artifact. Confirm it contains exactly the installers
   above plus `SHA256SUMS.txt`.
4. **Verify:** on the machine that will publish, run
   `sha256sum -c SHA256SUMS.txt` inside the bundle. On macOS use
   `shasum -a 256 -c SHA256SUMS.txt`; on macOS/Windows also open each installer to
   confirm the first-run setup screen appears (local smoke steps in CI already
   cover this on each OS).
5. **Tag to create the draft (user action):**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
   The `Release` workflow builds again and creates a **draft** release named for
   the tag. Nothing is public yet.
6. **Promote (user action, in GitHub UI):** review the draft, confirm the artifact
   list and checksums, then click **Publish release**. This is the only step that
   makes downloads public.

## Remaining user inputs / decisions

- Push the branch and open the PR (step 1).
- Decide whether to add signing secrets (step 2), or ship unsigned.
- Choose the first version tag (e.g. `v0.1.0`) and push it (step 5).
- Perform the final UI "Publish release" click (step 6).
- Confirm the macOS universal decision is acceptable (two native DMGs instead).

Nothing in this list requires terminal use by end users — they only download the
installer for their OS from the published release page.

## Scope discipline

No new features, no UI redesign, no hardening, no entitlement/license checks.
Hardening items (update signing, notarization, RPM toolchain upgrade, Electron
29 → supported major) are recorded in `FOLLOW_UPS.md` for a separate effort.
