import { gzipSync, gunzipSync } from 'zlib'
import { getDb } from '../db/db'
import type {
  File,
  Folder,
  Chunk,
  Version,
  Setting,
} from '../db/schema'

export interface IndexSnapshot {
  version: number
  exportedAt: number
  folders: Folder[]
  files: File[]
  chunks: Chunk[]
  versions: Version[]
  settings: Setting[]
}

export function buildIndexSnapshot(): IndexSnapshot {
  const db = getDb()

  const folders = db.prepare('SELECT * FROM folders').all() as Folder[]
  const files = db.prepare('SELECT * FROM files').all() as File[]
  const chunks = db.prepare('SELECT * FROM chunks').all() as Chunk[]
  const versions = db.prepare('SELECT * FROM versions').all() as Version[]
  const settings = db.prepare('SELECT * FROM settings').all() as Setting[]

  return {
    version: 1,
    exportedAt: Date.now(),
    folders,
    files,
    chunks,
    versions,
    settings,
  }
}

export function serializeIndex(snapshot: IndexSnapshot): Buffer {
  const json = JSON.stringify(snapshot)
  return gzipSync(Buffer.from(json, 'utf-8'))
}

export function deserializeIndex(buffer: Buffer): IndexSnapshot {
  const json = gunzipSync(buffer).toString('utf-8')
  return JSON.parse(json) as IndexSnapshot
}
