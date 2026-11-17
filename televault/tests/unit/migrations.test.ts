import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../../core/db/migrations'

function freshDb(): Database.Database {
  return new Database(':memory:')
}

function tableNames(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
    .map((r) => r.name)
}

function versions(db: Database.Database): number[] {
  return (
    db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[]
  ).map((r) => r.version)
}

describe('SQLite migrations', () => {
  it('creates the base schema and records every migration on a fresh DB', () => {
    const db = freshDb()
    runMigrations(db)

    for (const table of ['schema_migrations', 'folders', 'files', 'chunks', 'settings', 'trash']) {
      expect(tableNames(db)).toContain(table)
    }
    expect(versions(db).length).toBeGreaterThan(0)
    expect(versions(db)).toEqual([...versions(db)].sort((a, b) => a - b))
    db.close()
  })

  it('is idempotent when run twice', () => {
    const db = freshDb()
    runMigrations(db)
    const first = versions(db)
    expect(() => runMigrations(db)).not.toThrow()
    expect(versions(db)).toEqual(first)
    db.close()
  })

  it('repairs a legacy files table that is missing the starred column', () => {
    const db = freshDb()
    runMigrations(db)
    expect(
      (db.prepare('PRAGMA table_info(files)').all() as { name: string }[]).some(
        (c) => c.name === 'starred'
      )
    ).toBe(true)

    // The base schema indexes `starred`, so drop the index first (SQLite will
    // not drop a column that is still referenced by an index).
    db.exec('DROP INDEX IF EXISTS idx_files_starred')
    db.exec('ALTER TABLE files DROP COLUMN starred')
    expect(
      (db.prepare('PRAGMA table_info(files)').all() as { name: string }[]).some(
        (c) => c.name === 'starred'
      )
    ).toBe(false)

    // Force all migrations to run again on this DB.
    db.exec('DELETE FROM schema_migrations')
    runMigrations(db)
    expect(
      (db.prepare('PRAGMA table_info(files)').all() as { name: string }[]).some(
        (c) => c.name === 'starred'
      )
    ).toBe(true)
    db.close()
  })
})
