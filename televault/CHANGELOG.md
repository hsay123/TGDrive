# Changelog

All notable changes to TeleVault will be documented here.

## [Unreleased]

### Security
- Telegram session, API ID and API Hash are now stored with Electron `safeStorage` instead of plaintext SQLite settings. No plaintext fallback: when no OS credential store is available the session is memory-only for the current launch, with an explicit warning.
- Index snapshots now contain only an explicit allowlist of sync preferences. Credentials, private-channel IDs/access hashes and cached user data are no longer uploaded, and a hostile snapshot can no longer overwrite them on import.
- One-time migration for rc.1 installs: revokes the old Telegram session server-side, moves API credentials to protected storage, securely deletes plaintext rows (`secure_delete`, WAL checkpoint, `VACUUM`), scrubs local database backups and warns if manual revocation is needed.
- Removed log statements that printed the numeric API ID; added a source-grep test that fails if credential logging returns.
- Generic settings IPC refuses credential keys.
- See `docs/SECURITY.md` for storage details and the rc.1 exposure notice.

### Planned
- Payment gateway integration (Razorpay)
- Mobile app (iOS + Android)
- Shared team workspaces
- File starring

---

## [0.1.0] - 2026-06-11 — Initial Release

### Added

**Core Authentication**
- Telegram MTProto authentication (phone + OTP + 2FA support)
- Session persistence with secure keychain storage
- Auto-reconnect on network drop

**Virtual Filesystem (VFS)**
- Real nested folder structure (unlimited depth)
- Full-text search across all files and folders
- 30-day trash with one-click restore
- Keyboard navigation support

**File Operations**
- File upload with automatic chunking for files over 1.9 GB
- File download with automatic chunk reassembly
- Drag-and-drop upload with real-time progress tracking
- Batch upload and download support

**Pro Features (requires license)**
- Client-side AES-256-GCM encryption before upload
- Cross-device sync via Telegram index channel
- File version history with restore

**Media**
- In-app preview for images, video, audio, and PDF
- Thumbnail generation for common formats

**License System**
- Free / Pro / Team tiers
- Manual license key activation (no account required)
- Seat-based activation with machine tracking
- License validation server (Express + SQLite)
- Admin CLI for generating and managing keys

**App Infrastructure**
- Dark mode UI
- Auto-updater via GitHub Releases
- GitHub Actions CI/CD (build + release workflows)
- Cross-platform: Windows, macOS, Linux
