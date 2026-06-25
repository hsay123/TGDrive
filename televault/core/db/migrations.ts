import type Database from 'better-sqlite3'
import { SCHEMA } from './schema'

export interface Migration {
  version: number
  up: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: SCHEMA,
  },
]

/**
 * Safely add a column to a table if it doesn't already exist.
 * SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS,
 * so we check PRAGMA table_info first.
 */
function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
  }[]
  const exists = columns.some((col) => col.name === column)
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    console.log(`[migration] Added column ${column} to ${table}`)
  }
}

export function runMigrations(db: Database.Database): void {
  // Ensure the migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = new Set(
    (
      db.prepare('SELECT version FROM schema_migrations').all() as {
        version: number
      }[]
    ).map((r) => r.version)
  )

  // Migration 1: base schema — creates all tables if they don't exist
  if (!applied.has(1)) {
    const apply = db.transaction(() => {
      db.exec(SCHEMA)
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      ).run(1, Date.now())
    })
    apply()
    console.log('[migration 1] Applied base schema')
  }

  // Migration 2: add file_data column to trash if missing (schema drift fix)
  if (!applied.has(2)) {
    const apply = db.transaction(() => {
      ensureColumn(db, 'trash', 'file_data', 'TEXT')
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      ).run(2, Date.now())
    })
    apply()
    console.log('[migration 2] Ensured file_data column exists on trash table')
  }

  // Migration 3: add starred column to files table
  if (!applied.has(3)) {
    const apply = db.transaction(() => {
      ensureColumn(db, 'files', 'starred', 'INTEGER NOT NULL DEFAULT 0')
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      ).run(3, Date.now())
    })
    apply()
    console.log('[migration 3] Ensured starred column exists on files table')
  }

  // Migration 4: add version_chunks table
  if (!applied.has(4)) {
    const apply = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS version_chunks (
          id          TEXT PRIMARY KEY,
          version_id  TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          message_id  INTEGER NOT NULL,
          channel_id  TEXT NOT NULL,
          size        INTEGER NOT NULL,
          FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE
        );
      `)
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      ).run(4, Date.now())
    })
    apply()
    console.log('[migration 4] Created version_chunks table')
  }
}
