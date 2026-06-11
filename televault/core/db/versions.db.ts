import { v4 as uuidv4 } from 'uuid'
import { getDb } from './db'
import type { Version } from './schema'

export function createVersion(data: Omit<Version, 'id'>): Version {
  const db = getDb()
  const version: Version = {
    id: uuidv4(),
    ...data,
  }

  db.prepare(
    `INSERT INTO versions (id, file_id, version_num, size, uploaded_at, label)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    version.id,
    version.file_id,
    version.version_num,
    version.size,
    version.uploaded_at,
    version.label
  )

  return version
}

export function getVersionsByFileId(fileId: string): Version[] {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM versions WHERE file_id = ? ORDER BY version_num DESC'
    )
    .all(fileId) as Version[]
}

export function getLatestVersion(fileId: string): Version | undefined {
  const db = getDb()
  return db
    .prepare(
      'SELECT * FROM versions WHERE file_id = ? ORDER BY version_num DESC LIMIT 1'
    )
    .get(fileId) as Version | undefined
}

export function deleteVersionsByFileId(fileId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM versions WHERE file_id = ?').run(fileId)
}

export function getNextVersionNum(fileId: string): number {
  const db = getDb()
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(version_num), 0) AS max_version FROM versions WHERE file_id = ?'
    )
    .get(fileId) as { max_version: number }
  return row.max_version + 1
}
