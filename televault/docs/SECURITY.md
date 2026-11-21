# Security policy and credential storage

TeleVault stores three Telegram credential values: the **session string**, **API ID** and **API Hash**. All three are personal credentials. Treat a session string exactly like a password: anyone who has it can act as your Telegram account.

## Storage model (v0.1.0-rc.2 and later)

| Value | Where it lives | Notes |
|---|---|---|
| Telegram session string | Electron `safeStorage`-encrypted JSON at `<userData>/protected-credentials.json` | Loaded into memory for the current run. Never a plaintext `settings` row. |
| Telegram API ID / API Hash | Same protected file | Set on the first-run Setup screen. Never a plaintext `settings` row. |
| AES file-encryption key / reveal PIN | OS keychain via keytar (service `televault`) | Unchanged from earlier builds. |

`<userData>` is `%APPDATA%\TeleVault` on Windows, `~/Library/Application Support/TeleVault` on macOS and `~/.config/TeleVault` on Linux.

**There is no plaintext fallback.** If `safeStorage` is unavailable, or Linux selects the unencrypted `basic_text` backend, values are kept **in memory for the current launch only**. The Setup screen shows an explicit warning. You will be asked to sign in again next launch. To get persistent storage on Linux, install a keyring (`gnome-keyring` or `kwallet`) and restart TeleVault.

## What is and is not protected

- Index snapshots uploaded to the private Index channel contain only `auto_sync_interval` and `encryption_enabled`. Credentials, channel IDs/access hashes and cached user data are excluded on both export and import.
- Log statements never carry credential values. A source-grep unit test enforces this.
- The generic `settings:get` / `settings:set` / `settings:getAll` IPC bridge refuses credential keys.
- **File names, paths, MIME types and sizes are not encrypted.** They are stored in local SQLite and in Telegram message captions. TeleVault is not zero-knowledge.
- File contents are encrypted with AES-256-GCM only when encryption is enabled; the key is generated locally and has no recovery path.

## If you used v0.1.0-rc.1

rc.1 wrote the session, API ID and API Hash as plaintext in the local SQLite database, copied them into pre-pull database backups, and — in snapshots exported before the fix — uploaded them to your private Index channel as compressed (not encrypted) JSON.

On first launch of rc.2 the app performs a one-time migration:

1. It revokes the old session on Telegram's servers and signs you out **once**. Sign in again.
2. It moves the API ID and Hash into protected storage, then deletes the plaintext rows with `secure_delete`, a WAL checkpoint and `VACUUM`.
3. It scrubs every retained local database backup and prunes the backup directory to the newest five copies.
4. If Telegram could not be reached, local cleanup still happens and you are told to revoke the old session yourself at **Telegram → Settings → Devices** before signing in again.

The migration is idempotent and retries on the next launch if it is interrupted.

### Remaining risk the app cannot fix by itself

Old snapshot messages already in your Telegram Index channel may contain the rc.1 **session string**, API ID and API Hash, channel IDs/access hashes and account metadata in compressed (not encrypted) JSON. TeleVault cannot rewrite or recall Telegram messages that have already been sent, and it has no code that can enumerate old snapshots for deletion — only the newest snapshot message ID is stored locally. If you used rc.1, treat those values as exposed: delete the old index messages in Telegram yourself (they carry a `type: "index"` caption), review Telegram → Settings → Devices, and rotate your Telegram API credentials at [my.telegram.org/apps](https://my.telegram.org/apps) if you have reason to believe anyone else obtained them. See `docs/FACTS_FOR_WEBSITE.md` §9a for the full assessment of what the app can and cannot delete.

## Reporting a vulnerability

Please open a private security advisory on GitHub rather than a public issue. Include reproduction steps and the affected version. Do not paste real credentials, session strings or phone numbers into a report.

No reporter has been credited here; attribution will be added only if the reporter agrees.
