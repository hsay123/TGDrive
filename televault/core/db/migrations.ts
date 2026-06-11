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

function getCurrentVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null } | undefined
    return row?.version ?? 0
  } catch {
    return 0
  }
}

export function runMigrations(db: Database.Database): void {
  const currentVersion = getCurrentVersion(db)

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue
    }

    const apply = db.transaction(() => {
      db.exec(migration.up)
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
      ).run(migration.version, Date.now())
    })

    apply()
  }
}
