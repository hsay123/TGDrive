import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

function getDbPath(): string {
  return process.env.DB_PATH || path.join(__dirname, '../data/licenses.db')
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = getDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  _db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id                TEXT PRIMARY KEY,
      key               TEXT NOT NULL UNIQUE,
      tier              TEXT NOT NULL CHECK(tier IN ('pro', 'team')),
      email             TEXT NOT NULL,
      seats             INTEGER NOT NULL DEFAULT 1,
      active            INTEGER NOT NULL DEFAULT 1,
      created_at        INTEGER NOT NULL,
      expires_at        INTEGER,
      notes             TEXT,
      last_validated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS activations (
      id           TEXT PRIMARY KEY,
      license_key  TEXT NOT NULL,
      machine_id   TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      last_seen    INTEGER NOT NULL,
      UNIQUE(license_key, machine_id),
      FOREIGN KEY (license_key) REFERENCES licenses(key)
    );

    CREATE TABLE IF NOT EXISTS validation_log (
      id           TEXT PRIMARY KEY,
      license_key  TEXT NOT NULL,
      machine_id   TEXT,
      status       TEXT NOT NULL,
      ip           TEXT,
      validated_at INTEGER NOT NULL
    );
  `)

  return _db
}

export function closeDb(): void {
  if (_db) { _db.close(); _db = null }
}
