# TeleVault — RELEASE HANDOFF (Gate 2)

**Prepared:** 2026-11-17  
**Updated:** 2026-11-20 — `v0.1.0-rc.1` published as a pre-release<br>
**Source:** PR #9 `docs/release-finalization`, based on `main` at `54fa19e`  
**App version in tree:** `0.1.0` (`televault/package.json`)  
**Status:** `v0.1.0-rc.1` is published as a GitHub pre-release. The release record and verification evidence are in §10; the download links and platform notes below are ready for the website. No force-push or history rewrite was performed.

## 1. Release identity — values that need a real release

| Field | Value |
|---|---|
| Version tag | **`v0.1.0-rc.1`** |
| Release title | **`TeleVault v0.1.0-rc.1`** |
| Release date | **`2026-11-20T22:30:02Z`** (published) |
| GitHub release URL | **https://github.com/hsay123/TGDrive/releases/tag/v0.1.0-rc.1** |
| Publisher (GitHub login) | **`github-actions[bot]`** — draft created by the release workflow; published with `gh release edit --draft=false --prerelease` on user instruction |
| Release notes / announcement copy | Auto-generated from merged PR titles. Full changelog: `https://github.com/hsay123/TGDrive/commits/v0.1.0-rc.1` |
| Final `SHA256SUMS.txt` hashes | **See §10** — six published installers |
| Final artifact sizes | **See §10** |
| Checksum verification sign-off | **PASS** — six of six `sha256sum -c …: OK`; the published `SHA256SUMS.txt` is byte-identical to the verified local copy |

## 2. Pre-flight verification (already done)

| Check | Result | Evidence |
|---|---|---|
| `build.yml` — four-runner CI | **PASS, all 4 runners** | Run `44147531603` |
| `ubuntu-latest` | PASS | Run `44147531603` |
| `windows-2022` | PASS | Run `44147531603` |
| `macos-latest` (arm64) | PASS | Run `44147531603` |
| `macos-15-intel` (x64) | PASS | Run `44147531603` |
| Advisory / `continue-on-error` steps | **NONE** | No `continue-on-error` in either root workflow |
| Actions pinned to commit SHAs | YES | All `uses:` entries in `.github/workflows/*.yml` |
| Unit tests | PASS | Run `44147531603` (all four runners) |
| Windows installed-exe smoke | PASS (`RENDERER_READY`, `[smoke] PASS`) | Run `44147531603` |
| Release workflow dry run | **PASS** — all four build jobs and `assemble` succeeded; no tag, release or upload touched | Run `44147538158`, `dry_run = true` |
| Tags / releases in repo | **NONE** | `git ls-remote --tags origin`, `gh release list` |

**Note on `main`:** an earlier post-merge `main` run was red on Windows because electron-builder 26 auto-publishes on push-to-main when `--publish` is omitted. That was fixed by adding `--publish never` to the CI build step. Both verification runs cited above are green (`44147531603` CI, `44147538158` dry run) and no tag, release or upload was created.

**Historical note:** §2 records the state when this handoff was prepared (2026-11-17). `v0.1.0-rc.1` has since been tagged and published — see §10. PRs #24 and #25 were merged after the rc.1 build; they are covered by the post-merge dry run `44824983485` but are **not** in the published rc.1 installers, which were built from `1b662a7…`.

## 3. Final asset inventory (exact names)

### Windows (`windows-2022`)
- `TeleVault-windows-x64.exe`
- `TeleVault-windows-x64.exe.blockmap`
- `latest.yml` (shared update metadata)

### macOS x64 / Intel (`macos-15-intel`)
- `TeleVault-macos-x64.dmg`
- `TeleVault-macos-x64.dmg.blockmap`
- `TeleVault-macos-x64.zip`
- `TeleVault-macos-x64.zip.blockmap`

### macOS arm64 / Apple Silicon (`macos-latest`)
- `TeleVault-macos-arm64.dmg`
- `TeleVault-macos-arm64.dmg.blockmap`
- `TeleVault-macos-arm64.zip`
- `TeleVault-macos-arm64.zip.blockmap`

### Linux x64 (`ubuntu-latest`)
- `TeleVault-linux-x64.AppImage` (block map is embedded, not a separate file)
- `TeleVault-linux-x64.deb`
- `TeleVault-linux-x64.rpm`
- `latest-linux.yml` (shared update metadata)

### Shared
- `latest-mac.yml` (shared update metadata; produced by both macOS jobs, staged once)
- `SHA256SUMS.txt` (hashes the six published installers only: Windows `.exe`, both macOS `.dmg`s, Linux `.AppImage`, `.deb`, `.rpm`)

`.blockmap`, `.zip` and `latest*.yml` files are update/companion assets. They are staged into the release but intentionally excluded from `SHA256SUMS.txt`.

### Website download links — the six installers only

The website should link **exactly these six installer files**:

| Platform | Installer |
|---|---|
| Windows x64 | `TeleVault-windows-x64.exe` |
| macOS x64 / Intel | `TeleVault-macos-x64.dmg` |
| macOS arm64 / Apple Silicon | `TeleVault-macos-arm64.dmg` |
| Linux x64 | `TeleVault-linux-x64.AppImage` |
| Linux x64 | `TeleVault-linux-x64.deb` |
| Linux x64 | `TeleVault-linux-x64.rpm` |

**Do not link `.zip`, `.blockmap` or `latest*.yml` from the website.** Those are update/companion assets: `.zip` is an alternate macOS archive, `.blockmap` files enable delta updates, and `latest*.yml` files are consumed by `electron-updater` — none are end-user installers. `SHA256SUMS.txt` is a verification aid for the six installers, not a download link.

## 4. Signing and platform warnings

| Platform | Status |
|---|---|
| Windows | Unsigned; SmartScreen "Windows protected your PC" is expected |
| macOS arm64 | **Ad-hoc signed** with hardened runtime and `disable-library-validation`; valid seal, not notarized. First launch uses System Settings → Privacy & Security → Open Anyway. Exact steps: `docs/TROUBLESHOOTING.md` |
| macOS x64 | Unsigned; may show "damaged and can't be opened" on macOS 15 |
| Notarization / Developer ID | Not configured (no signing secrets in CI) |

## 5. Update-feed configuration

| Field | Value |
|---|---|
| Provider | GitHub, `hsay123/TGDrive`, stable channel (`releaseType: release`) |
| Feed URLs | `https://github.com/hsay123/TGDrive/releases.atom`, `.../releases/latest`, `.../releases/download/<tag>/latest*.yml` |
| Per-install ID | Random UUID in `<userData>/.updaterId`, sent as `x-user-staging-id`; not an account ID |
| Offline behaviour | Non-fatal; logged via `electron-log`, no dialog, app keeps working |
| Download / install policy | `autoDownload = false`; explicit user download; install only on quit |
| `-rc` pre-release handling | **SET** — the rc.1 draft was created with `--prerelease` and published with `--prerelease`; API reports `isDraft=false, isPrerelease=true`. Because `releaseType: release` selects the stable channel, existing clients will **not** auto-update to this pre-release; rc testers must install manually. |
| `latest-mac.yml` for rc.1 | **arm64-only** — a known limitation (see §10). The two macOS jobs each emit their own `latest-mac.yml` and staging kept one, so Intel Macs are not offered an update by rc.1's feed. PR #25 merges both architectures and is verified by dry run `44824983485`; it will ship in rc.2. |

Full facts for website copy: `docs/FACTS_FOR_WEBSITE.md` section 5a.

## 6. Publish checklist — user actions only

For the publish that was actually performed, see §10. The list below is the original checklist.

1. Review PR #9; confirm CI run `44133149419` is green on all four runners and the dry-run bundle is correct.
2. Decide the tag (e.g. `v0.1.0`) and whether `-rc` drafts must be marked pre-release (see §5).
3. Push the tag yourself:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. Wait for the `Release` workflow to finish. It builds again, verifies `SHA256SUMS.txt`, and creates a **draft** release. Nothing is public yet.
5. In the draft, confirm every asset name from §3 is present and download `SHA256SUMS.txt`.
6. On the publishing machine, verify:
   ```bash
   sha256sum -c SHA256SUMS.txt        # Linux
   shasum -a 256 -c SHA256SUMS.txt    # macOS
   ```
7. Fill the **TBD** fields in §1 with the real tag, URL, date, publisher and sign-off.
8. Click **Publish release** in the GitHub UI. This is the only step that makes downloads public.

## 7. Post-release checks

- Open the published release page from an incognito browser and confirm all assets download.
- On Apple Silicon, follow `docs/TROUBLESHOOTING.md` and confirm the "Open Anyway" path (not "damaged").
- On Windows, confirm the SmartScreen bypass and first-run setup screen.
- On Linux, confirm `.AppImage`, `.deb` and `.rpm` install and reach first-run setup.
- Confirm the updater sees the release from a packaged build; a fresh install with no published release previously only logged a non-fatal failure.

## 8. Scope discipline

No new features, no UI redesign, no license/payment gating, no history rewrite. No security-audit details were copied into this handoff. Automated publishing remains disabled: all builds use `--publish never`, and the draft is created only by an explicit tag push with `gh release create --draft`.

## 9. Known issues in this beta

| Area | Issue | Detail |
|---|---|---|
| Encryption | Key loss is permanent | Losing the OS-keychain key makes encrypted files permanently unreadable. This beta has no recovery-key export/import; a guard blocks silent key replacement when encrypted rows exist, and the toggle is disabled when no secure key store is available. See `docs/FOLLOW_UPS.md` item 19. |
| Delete | "Delete permanently" leaves traces | It deletes the file's recorded Telegram messages and local database records, but cached thumbnails, old sync snapshots and archived version messages remain. |
| Sync | Last-writer-wins full replace | Conflicts are not resolved per item: the most recently pushed device wins entirely and can overwrite newer local metadata. A local DB backup is taken before each full replace, but conflict resolution is still needed. See `docs/FOLLOW_UPS.md` B3. |
| Trash | 30-day purge leaves orphaned Telegram data | Expired trash rows lose their local references at startup and daily, but the underlying messages are intentionally left in the user's Telegram account. With the local pointers gone, TeleVault can no longer locate or delete those messages; they remain in the account until removed manually. |
| Delete | Permanent delete leaves traces | Cached thumbnails on disk, old sync snapshots in the Index channel and archived version messages are not removed when a file is permanently deleted. |
| Signing | Not notarized | macOS builds are ad-hoc signed but not Developer-ID signed or notarized; Windows SmartScreen and macOS Gatekeeper warnings are expected on first launch. |
| Features | Incomplete | File version history and tags are not available yet; share links point to private Telegram channels and are not usable by non-users. |
| Security | **rc.1 shipped plaintext credentials** | `v0.1.0-rc.1` stored the Telegram session, API ID and API Hash as plaintext SQLite settings, copied them into pre-pull DB backups, and uploaded them in Index snapshots. rc.2 protects them and performs a one-time migration. **rc.1 users must update and will be signed out once.** Details in `docs/SECURITY.md`. |
| Security | Old Index snapshots cannot be recalled | Snapshots already uploaded to Telegram still contain the rc.1 API Hash and account metadata in compressed JSON; the app cannot rewrite past messages. Users must delete those messages in Telegram and rotate API credentials if needed. |

## 10. v0.1.0-rc.1 published record

| Field | Value |
|---|---|
| Gate authorisation | User replied `TAG v0.1.0-rc.1`, then `PUBLISH v0.1.0-rc.1` |
| Tagged commit | `1b662a7e129684ec30c8753694822398899cd0f5` — annotated tag, message `first release candidate`, created without touching the working tree |
| Tagged release build | Run `44818774505` — `completed / success`, all six jobs green, no reruns |
| Post-merge dry run | Run `44824983485` — `completed / success`, `main` at `a6334478cbcc7eb2e1d983957084deb4298a883e`, `dry_run = true`; no tag or release touched |
| Draft state before publish | `isDraft=true`, `isPrerelease=true`, `tagName=v0.1.0-rc.1`, 17 assets |
| Published | `2026-11-20T22:30:02Z` — `isDraft=false`, `isPrerelease=true`, 17 assets |
| Public URL | https://github.com/hsay123/TGDrive/releases/tag/v0.1.0-rc.1 |
| Tag after publish | still `1b662a7e129684ec30c8753694822398899cd0f5` — never moved, deleted or re-pushed |

### Published installers — the six website download links

| Asset | Bytes | SHA-256 |
|---|---:|---|
| `TeleVault-windows-x64.exe` | 143,231,493 | `0bc793784b678be66daf60ac49bf0daacf2b6b6d82145e8ab6469d42b4798ad5` |
| `TeleVault-macos-x64.dmg` | 157,002,697 | `19f3bba693d77750ca799b59657c35530dfa9964d6949d0bfd1a50110dafd8f8` |
| `TeleVault-macos-arm64.dmg` | 150,413,075 | `b56671696377224aec2a011717032175ddd02e1fe6e129fb5038f3a3615b4ac7` |
| `TeleVault-linux-x64.AppImage` | 164,136,455 | `5b020f46fa4734f5fde39fdb87a0992fb4bbb1421d72c326d8b11d9d256eda02` |
| `TeleVault-linux-x64.deb` | 130,958,060 | `8beeb50e0195ccc29828e4a48d58f663940f6320be904de9ac94e912579d58ff` |
| `TeleVault-linux-x64.rpm` | 112,857,715 | `209ae2c7062582ae357bb6d1ace52b7b108f74a576bafcb68bf99752e0f3fdb1` |

### Verification evidence

- `SHA256SUMS.txt` contains exactly those six installers; `sha256sum -c` returned `OK` six of six. The copy downloaded anonymously after publish is byte-identical to the verified local copy.
- AppImage extraction: 0 `.env` files, 0 `*.session` files, 0 license-server URLs, 0 `api_hash` literals (no values printed).
- `.deb` reports `Version: 0.1.0~rc.1` and depends on `libsecret-1-0`; `.rpm` also declares `libsecret`.
- Headless smoke (`xvfb-run`, `TELEVAULT_SMOKE=1`): `RENDERER_READY` within ~30 s.
- All three `latest*.yml` files report `version: 0.1.0-rc.1`.
- Anonymous post-publish checks (no `GH_TOKEN`/`GITHUB_TOKEN`): API reports `draft=false, prerelease=true`; release page returns HTTP 200; all six installers return HTTP 206 on range reads; the three updater feeds are publicly readable.

### Caveats for this candidate

- `latest-mac.yml` in the published rc.1 lists **arm64 only** (§5). Intel Macs must download `TeleVault-macos-x64.dmg` manually. The merge fix in PR #25 is verified by dry run `44824983485` but was not applied to the already-built rc.1 assets; it will ship in rc.2.
- Stable-channel clients do not auto-update to this pre-release (`releaseType: release`, §5).
- Gate B: the user issued the `PUBLISH` gate directly; per-OS manual QA results are not recorded in this handoff. Platform warnings in §4 still apply.
- Emergency rollback, only on explicit request: `gh release edit v0.1.0-rc.1 --draft=true`. Do not move, delete or re-push the tag; fix forward with `v0.1.0-rc.2`.

## 11. rc.2 security-fix handoff (pre-release preparation)

`v0.1.0-rc.1` stays published and its tag is untouched. The fix is forward-only, prepared as five independent PRs off `origin/main`. **Nothing here has been merged, tagged or published.**

| PR | Branch | Scope | Local checks |
|---|---|---|---|
| #28 | `security/session-protection` | Snapshot settings allowlist + hostile-snapshot tests | 37/37 unit tests, both typechecks; CI run `44937446278` PASS on all four runners |
| #31 | `security/protected-credentials` | `safeStorage` protected store, memory-only no-keyring path, log fix, generic-settings IPC restriction | 39/39 unit tests, both typechecks; CI run `44938133064` PASS on all four runners |
| #32 | `security/legacy-session-migration` | One-time rc.1 migration + backup scrubbing | 40/40 unit tests, both typechecks; CI run `44938553409` PASS on all four runners |
| docs | `security/rc2-docs` | This document, `SECURITY.md`, README, facts sheet, changelog, follow-ups | Documentation only |
| version | separate branch | `0.1.0-rc.2` in `package.json` / `package-lock.json` only — **no tag** | CI on all four runners |

**Required merge order:** #28 → #31 → #32 → docs → version. PR #32 includes a byte-identical copy of `protected-store.ts` so it builds on its own, but its startup migration deletes plaintext rows that `origin/main` still reads; it must not be merged before #31.

### User-facing impact

- rc.1 users **must update** and will be **signed out once** on first rc.2 launch so the leaked session can be revoked server-side. They then sign in normally.
- If Telegram cannot be reached, the app still removes local plaintext and shows a dialog instructing the user to revoke the session at **Telegram → Settings → Devices** before signing in again.
- On Linux without a keyring, sign-in is memory-only for each launch. Users are warned and pointed to gnome-keyring/kwallet.

### Not verifiable in CI (manual QA before stable)

- Real Telegram `auth.LogOut` while online (CI never performs a real login).
- Windows DPAPI, macOS Keychain and Linux secret-service round trips on real desktops, including a locked/absent keyring.
- Deleting already-uploaded rc.1 Index snapshots from Telegram; the app only knows the latest snapshot message ID.
- Real-device restoration of a signed-out user through the migration dialog.

No reporter attribution is included; add credit only if the reporter agrees. No tag, release, publish or force-push was performed for rc.2.
