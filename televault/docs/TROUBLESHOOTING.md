# TeleVault — troubleshooting

## Linux: libsecret / keyring

TeleVault stores the AES encryption key and the hidden-folder PIN in the OS
credential store through `keytar`. On Linux that means **libsecret** plus a
running secret service (GNOME Keyring, KDE Wallet, or equivalent) in the desktop
session.

| Distributor | Install command |
|---|---|
| Debian / Ubuntu | `sudo apt install libsecret-1-0` |
| Fedora / RHEL | `sudo dnf install libsecret` |
| Arch / Manjaro | `sudo pacman -S libsecret` |

The `.deb` declares `libsecret-1-0` as a dependency and installs it
automatically. The AppImage cannot declare dependencies, so install libsecret
yourself before first run.

**What happens without a keyring:**

- The app still starts and renders the first-run `/setup` screen with no
  console or page errors. Keytar is loaded lazily, so a missing keyring does not
  crash startup (verified under xvfb with a nonexistent D-Bus address; see
  `docs/QA_CHECKLIST.md`).
- Encrypted upload/download fails with the raw libsecret error
  `Could not connect: No such file or directory` when the library is present but
  no secret service is reachable. Unencrypted use is unaffected.
- If the libsecret shared library itself is absent, the error is wrapped with a
  Debian/Ubuntu install hint (`core/crypto/secure-store.ts`).

There is no key escrow or recovery path, so back up your OS keychain — see
`docs/FACTS_FOR_WEBSITE.md` section 1 for exactly what is and is not encrypted.

## `Cannot find module 'better-sqlite3'` / `'keytar'`

Native modules are compiled for Electron's ABI by `postinstall`. If they were
built for the host Node instead, rebuild them:

```bash
npm run rebuild
```

## Blank window on first launch (packaged app)

The renderer is loaded from a `file://` URL built with `pathToFileURL`, so a
Windows drive letter is always in the URL path. If a packaged build still shows
an empty window, launch with `TELEVAULT_SMOKE=1`: the main process then writes
`tv-smoke.log` into the app-data directory (`%APPDATA%\TeleVault`,
`~/Library/Application Support/TeleVault`, or `~/.config/TeleVault`) with the
exact load URL and `did-fail-load` / `did-finish-load` events. Attach that file
to the bug report. This logging is completely off when the variable is unset.

## Unsigned-build warnings

There is no Developer ID / notarization secret in CI. Windows SmartScreen will
show a "Windows protected your PC" dialog, and the Intel macOS DMG is unsigned.
The Apple Silicon DMG is **ad-hoc signed** in the release workflow: that gives
it a valid code seal, but it is still not notarized, so Gatekeeper warns on
first launch. See `docs/RELEASE_PROCESS.md` for the optional signing inputs.

### macOS arm64 (Apple Silicon) — install the ad-hoc-signed DMG

1. Download `TeleVault-macos-arm64.dmg` from the release page and open it with
   Finder.
2. Drag `TeleVault.app` into `/Applications`, then eject the DMG.
3. Launch TeleVault from Applications. On first launch macOS shows
   **"TeleVault" Not Opened — Apple could not verify "TeleVault.app" is free of
   malware…** (older macOS: "cannot be opened because the developer cannot be
   verified"). Click **Done**, not **Move to Trash**.
4. Open **System Settings → Privacy & Security**, scroll to the Security
   section, and click **Open Anyway** next to the TeleVault entry. Confirm with
   your Mac password when asked. On macOS 14 and earlier you can instead
   Control-click `TeleVault.app` in Applications and choose **Open**, then
   **Open** in the dialog.
5. macOS remembers this exception, so later launches open normally.

If you still see **"TeleVault is damaged and can't be opened"**, the copy you
downloaded is broken or its seal was modified (for example by a third-party
unarchiver). Delete it, re-download from the official release page, and open
the DMG with Finder. As a last resort, remove the quarantine attribute from the
app you already trust and launch it again:

```bash
xattr -dr com.apple.quarantine /Applications/TeleVault.app
```

For the Intel (`TeleVault-macos-x64.dmg`) build, which is not ad-hoc signed, use
steps 1–2, then Control-click → Open on macOS 14 and earlier. On macOS 15 the
unsigned build may only offer **Move to Trash**; use the Apple Silicon DMG on
Apple hardware where possible, or supply a Developer ID certificate in CI.
