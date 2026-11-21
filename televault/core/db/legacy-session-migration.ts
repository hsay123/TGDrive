import type Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { ProtectedKey } from '../crypto/protected-store'

/**
 * One-time migration away from rc.1's plaintext Telegram credentials.
 *
 * rc.1 stored the GramJS StringSession, API ID and API hash as plain rows in
 * the `settings` table. Those rows were also copied into sync backups and (for
 * a snapshot exported before the allowlist fix) uploaded to the Index channel.
 * A StringSession is a bearer credential, so removing the local rows is not
 * enough: the session must also be revoked on Telegram's side.
 *
 * This module is deliberately dependency-injected. It runs on `origin/main`
 * before the protected-storage change lands, so it must read the legacy rows
 * itself (it cannot use client.getApiCredentials(), which will read the
 * protected store once that PR merges).
 *
 * Everything here is idempotent: the marker row is written only after the
 * local cleanup succeeds, so an interrupted run simply starts over next time.
 */

export const LEGACY_SECRET_KEYS = [
  'telegram_session',
  'telegram_api_id',
  'telegram_api_hash',
] as const

const MARKER_KEY = 'security_session_protection_migrated'
const BACKUP_PREFIX = 'televault-before-pull-'
const MAX_BACKUPS = 5

export type MigrationNoticeKind =
  | 'signed-out-once'
  | 'offline-revocation-needed'
  | 'credentials-memory-only'

export interface MigrationNotice {
  kind: MigrationNoticeKind
  title: string
  message: string
}

export interface LegacyMigrationDeps {
  getDb: () => Database.Database
  userDataPath: () => string
  /** Revoke the leaked session on Telegram's servers using the legacy values. */
  revokeSession: (apiId: number, apiHash: string, session: string) => Promise<void>
  /** Move a legacy credential into OS-protected storage. */
  saveProtected: (key: ProtectedKey, value: string) => void
  /** False means the protected store is memory-only for this run. */
  protectedStorePersisted: () => boolean
  notify: (notice: MigrationNotice) => void
  log?: (message: string) => void
}

interface LegacyRows {
  session: string | null
  apiId: string | null
  apiHash: string | null
}

function readLegacyRows(db: Database.Database): LegacyRows {
  const rows = db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN (?, ?, ?)`
    )
    .all(...LEGACY_SECRET_KEYS) as Array<{ key: string; value: string }>
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  return {
    session: byKey.get('telegram_session') ?? null,
    apiId: byKey.get('telegram_api_id') ?? null,
    apiHash: byKey.get('telegram_api_hash') ?? null,
  }
}

function hasMarker(db: Database.Database): boolean {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(MARKER_KEY) as { value: string } | undefined
  return row?.value === '1'
}

function writeMarker(db: Database.Database): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(MARKER_KEY, '1')
}

/**
 * Scrub every local backup copy of the database. Backups older than the newest
 * five are deleted outright; the retained five are opened and their credential
 * rows removed with secure_delete + checkpoint + VACUUM so the plaintext bytes
 * are not left in freed pages. A backup that cannot be scrubbed is deleted —
 * never left behind with a secret in it.
 */
export function scrubBackupCopies(
  userDataPath: string,
  log: (message: string) => void = () => {}
): void {
  const dir = path.join(userDataPath, 'backups')
  if (!fs.existsSync(dir)) return

  const files = fs
    .readdirSync(dir)
    .filter(
      (name) =>
        name.startsWith(BACKUP_PREFIX) && name.endsWith('.db') &&
        fs.statSync(path.join(dir, name)).isFile()
    )
    .sort()

  const keep = new Set(files.slice(-MAX_BACKUPS))
  for (const name of files) {
    const file = path.join(dir, name)
    if (!keep.has(name)) {
      removeFileAndSidecars(file)
      continue
    }
    if (!scrubBackupFile(file)) {
      log(`[security-migration] could not scrub backup ${name}; removed it`)
      removeFileAndSidecars(file)
    }
  }
}

function removeFileAndSidecars(file: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${file}${suffix}`)
    } catch {
      // already gone — nothing to do
    }
  }
}

function scrubBackupFile(file: string): boolean {
  // Required lazily so callers that only test the pure logic don't need the
  // native binding loaded at module import time.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  let db: Database.Database | null = null
  try {
    db = new Database(file)
    db.pragma('secure_delete = ON')
    const placeholders = LEGACY_SECRET_KEYS.map(() => '?').join(', ')
    db.prepare(`DELETE FROM settings WHERE key IN (${placeholders})`).run(
      ...LEGACY_SECRET_KEYS
    )
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
    return true
  } catch {
    return false
  } finally {
    try {
      db?.close()
    } catch {
      // ignore close errors on a corrupt backup
    }
  }
}

export async function runLegacySessionMigration(
  deps: LegacyMigrationDeps
): Promise<void> {
  const log = deps.log ?? (() => {})
  const db = deps.getDb()

  if (hasMarker(db)) {
    log('[security-migration] already applied')
    // Still prune/scrub: a partially completed earlier run or a restored old
    // backup directory may contain secret-bearing copies.
    scrubBackupCopies(deps.userDataPath(), log)
    return
  }

  const legacy = readLegacyRows(db)
  if (!legacy.session && !legacy.apiId && !legacy.apiHash) {
    writeMarker(db)
    scrubBackupCopies(deps.userDataPath(), log)
    return
  }

  // 1. Invalidate the leaked session on Telegram's servers. If we are offline,
  //    local cleanup still proceeds, but the user is told to revoke manually.
  let revoked = false
  if (legacy.session && legacy.apiId && legacy.apiHash) {
    const apiId = Number.parseInt(legacy.apiId, 10)
    if (Number.isFinite(apiId) && apiId > 0) {
      try {
        await deps.revokeSession(apiId, legacy.apiHash, legacy.session)
        revoked = true
      } catch (error) {
        log(
          `[security-migration] server-side revocation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }
    }
  }

  // 2. Move the API credentials to protected storage before deleting the rows.
  //    A memory-only store still works for this run; it is announced below.
  if (legacy.apiId) deps.saveProtected('telegram_api_id', legacy.apiId)
  if (legacy.apiHash) deps.saveProtected('telegram_api_hash', legacy.apiHash)

  // 3. Delete the plaintext rows, then flush freed pages so the bytes are not
  //    recoverable from the live database file.
  db.pragma('secure_delete = ON')
  db.prepare(
    `DELETE FROM settings WHERE key IN (${LEGACY_SECRET_KEYS.map(() => '?').join(', ')})`
  ).run(...LEGACY_SECRET_KEYS)
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.exec('VACUUM')

  // 4. Fix every local copy and prune to the newest five.
  scrubBackupCopies(deps.userDataPath(), log)

  // 5. Mark complete only after all of the above succeeded.
  writeMarker(db)

  // 6. Tell the user exactly what happened and what they must do.
  if (!revoked && legacy.session) {
    deps.notify({
      kind: 'offline-revocation-needed',
      title: 'Action needed: revoke the old Telegram session',
      message:
        'TeleVault removed the old plaintext session from this device, but ' +
        'could not reach Telegram to revoke it. In Telegram open ' +
        'Settings → Devices and end the TeleVault session (or any session ' +
        'you do not recognise), then sign in again here.',
    })
  } else {
    deps.notify({
      kind: 'signed-out-once',
      title: 'Security update: please sign in once',
      message:
        'TeleVault moved your credentials to protected storage and revoked ' +
        'the old session. Please sign in again once. This will not happen ' +
        'again.',
    })
  }

  if (legacy.apiId && legacy.apiHash && !deps.protectedStorePersisted()) {
    deps.notify({
      kind: 'credentials-memory-only',
      title: 'No secure credential store available',
      message:
        'This computer has no OS credential store available. Your API ' +
        'credentials will be kept for this session only, so you will need ' +
        'to enter them again next launch. On Linux, install gnome-keyring ' +
        'or kwallet and restart TeleVault.',
    })
  }
}
