import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { runMigrations } from './migrations'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = path.join(app.getPath('userData'), 'televault.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  runMigrations(_db)

  return _db
}

const BACKUP_PREFIX = 'televault-before-pull-'
const MAX_SYNC_BACKUPS = 5

/**
 * Smallest safe mitigation for last-writer-wins sync: take a consistent local
 * copy of the DB before pullIndex() replaces files/folders/chunks/versions.
 * A failed backup aborts the pull; it never proceeds without a safety copy.
 */
export async function backupDatabaseBeforePull(): Promise<string> {
  const db = getDb()
  const dir = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(dir, { recursive: true })

  const target = path.join(dir, `${BACKUP_PREFIX}${Date.now()}.db`)
  await db.backup(target)

  const older = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith('.db'))
    .sort()
    .slice(0, -MAX_SYNC_BACKUPS)
  for (const name of older) {
    fs.unlinkSync(path.join(dir, name))
  }

  return target
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
