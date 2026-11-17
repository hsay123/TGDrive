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

Official installers are currently **unsigned**. Windows SmartScreen will show a
"Windows protected your PC" dialog and macOS Gatekeeper will block first launch
until the app is opened explicitly from Applications. There is no signing
secret in CI; see `docs/RELEASE_PROCESS.md` for the optional signing inputs.
