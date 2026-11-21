import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  runLegacySessionMigration,
  scrubBackupCopies,
  type LegacyMigrationDeps,
  type MigrationNotice,
} from '../../core/db/legacy-session-migration'

// Fake, seeded values only — never real credentials.
const FAKE = {
  session: 'FAKE_LEGACY_SESSION_VALUE_FOR_TESTS',
  apiId: '1234567',
  apiHash: 'fakelegacyhash0123456789abcdef',
}

const USERDATA = path.join('/tmp', 'tv-test-legacy-migration')
const DB_PATH = path.join(USERDATA, 'televault.db')
const BACKUPS = path.join(USERDATA, 'backups')

interface Harness {
  deps: LegacyMigrationDeps
  notices: MigrationNotice[]
  revoke: ReturnType<typeof vi.fn>
  saved: Array<{ key: string; value: string }>
  db: Database.Database
}

function backupFile(index: number): string {
  return path.join(BACKUPS, `televault-before-pull-${index}.db`)
}

function makeBackup(index: number): void {
  const db = new Database(backupFile(index))
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'telegram_session',
    FAKE.session + `-backup-${index}`
  )
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'telegram_api_hash',
    FAKE.apiHash + `-backup-${index}`
  )
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'auto_sync_interval',
    '60000'
  )
  db.close()
}

function rawContains(file: string, needle: string): boolean {
  return fs.readFileSync(file).includes(Buffer.from(needle))
}

function seedLegacyRows(db: Database.Database): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'telegram_session',
    FAKE.session
  )
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'telegram_api_id',
    FAKE.apiId
  )
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'telegram_api_hash',
    FAKE.apiHash
  )
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    'auto_sync_interval',
    '60000'
  )
}

function harness(options: { revokeError?: Error; persisted?: boolean } = {}): Harness {
  const notices: MigrationNotice[] = []
  const saved: Array<{ key: string; value: string }> = []
  const revoke = vi.fn(async () => {
    if (options.revokeError) throw options.revokeError
  })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')

  const deps: LegacyMigrationDeps = {
    getDb: () => db,
    userDataPath: () => USERDATA,
    revokeSession: revoke,
    saveProtected: (key, value) => {
      saved.push({ key, value })
    },
    protectedStorePersisted: () => options.persisted ?? true,
    notify: (notice) => {
      notices.push(notice)
    },
    log: () => {},
  }
  return { deps, notices, revoke, saved, db }
}

beforeEach(() => {
  fs.rmSync(USERDATA, { recursive: true, force: true })
  fs.mkdirSync(BACKUPS, { recursive: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(USERDATA, { recursive: true, force: true })
})

describe('rc.1 plaintext session migration', () => {
  it('revokes, protects, and physically removes every plaintext credential', async () => {
    const h = harness()
    h.db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    seedLegacyRows(h.db)
    for (let i = 1; i <= 3; i++) makeBackup(i)

    await runLegacySessionMigration(h.deps)

    expect(h.revoke).toHaveBeenCalledTimes(1)
    expect(h.revoke).toHaveBeenCalledWith(
      Number(FAKE.apiId),
      FAKE.apiHash,
      FAKE.session
    )
    expect(h.saved).toEqual([
      { key: 'telegram_api_id', value: FAKE.apiId },
      { key: 'telegram_api_hash', value: FAKE.apiHash },
    ])

    const remaining = h.db
      .prepare('SELECT key FROM settings ORDER BY key')
      .all() as Array<{ key: string }>
    expect(remaining.map((row) => row.key)).toEqual([
      'auto_sync_interval',
      'security_session_protection_migrated',
    ])

    // VACUUM must have rewritten the file: no fake secret bytes survive.
    expect(rawContains(DB_PATH, FAKE.session)).toBe(false)
    expect(rawContains(DB_PATH, FAKE.apiHash)).toBe(false)
    expect(rawContains(DB_PATH, FAKE.apiId)).toBe(false)

    // Every retained backup is scrubbed too.
    for (let i = 1; i <= 3; i++) {
      expect(rawContains(backupFile(i), FAKE.session)).toBe(false)
      expect(rawContains(backupFile(i), FAKE.apiHash)).toBe(false)
    }
    expect(h.notices.map((n) => n.kind)).toEqual(['signed-out-once'])
    h.db.close()
  })

  it('is idempotent — a second launch does nothing and never revokes twice', async () => {
    const h = harness()
    h.db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    seedLegacyRows(h.db)

    await runLegacySessionMigration(h.deps)
    // Put the plaintext back to simulate a stale restored backup of settings.
    seedLegacyRows(h.db)
    await runLegacySessionMigration(h.deps)

    expect(h.revoke).toHaveBeenCalledTimes(1)
    expect(h.notices).toHaveLength(1)
    expect(
      h.db
        .prepare("SELECT value FROM settings WHERE key = 'security_session_protection_migrated'")
        .get()
    ).toEqual({ value: '1' })
    h.db.close()
  })

  it('still removes local secrets offline and tells the user to revoke in Telegram', async () => {
    const h = harness({ revokeError: new Error('fake offline error') })
    h.db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    seedLegacyRows(h.db)

    await runLegacySessionMigration(h.deps)

    expect(rawContains(DB_PATH, FAKE.session)).toBe(false)
    expect(h.notices[0]?.kind).toBe('offline-revocation-needed')
    expect(h.notices[0]?.message).toContain('Settings → Devices')
    expect(h.notices[0]?.message).toContain('sign in again')
    h.db.close()
  })

  it('warns separately when credentials can only live in memory', async () => {
    const h = harness({ persisted: false })
    h.db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    seedLegacyRows(h.db)

    await runLegacySessionMigration(h.deps)

    expect(h.saved).toHaveLength(2)
    expect(h.notices.map((n) => n.kind)).toEqual([
      'signed-out-once',
      'credentials-memory-only',
    ])
    expect(h.notices[1]?.message).toContain('gnome-keyring')
    h.db.close()
  })

  it('scrubs all backup copies and keeps only the newest five', () => {
    for (let i = 1; i <= 8; i++) makeBackup(i)

    scrubBackupCopies(USERDATA)

    const files = fs.readdirSync(BACKUPS).sort()
    expect(files).toHaveLength(5)
    // Sorted lexically: 4..8 are the newest.
    expect(files).toEqual([
      'televault-before-pull-4.db',
      'televault-before-pull-5.db',
      'televault-before-pull-6.db',
      'televault-before-pull-7.db',
      'televault-before-pull-8.db',
    ])
    for (const file of files) {
      expect(rawContains(path.join(BACKUPS, file), FAKE.session)).toBe(false)
      expect(rawContains(path.join(BACKUPS, file), FAKE.apiHash)).toBe(false)
    }
  })

  it('marks a clean install as migrated without notifying the user', async () => {
    const h = harness()
    h.db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')

    await runLegacySessionMigration(h.deps)

    expect(h.revoke).not.toHaveBeenCalled()
    expect(h.notices).toEqual([])
    expect(
      h.db
        .prepare("SELECT value FROM settings WHERE key = 'security_session_protection_migrated'")
        .get()
    ).toEqual({ value: '1' })
    h.db.close()
  })
})
