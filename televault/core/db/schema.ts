export const SCHEMA = `
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  id             TEXT PRIMARY KEY,
  folder_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  path           TEXT NOT NULL UNIQUE,
  size           INTEGER NOT NULL,
  mime_type      TEXT,
  is_encrypted   INTEGER NOT NULL DEFAULT 0,
  is_chunked     INTEGER NOT NULL DEFAULT 0,
  chunk_count    INTEGER NOT NULL DEFAULT 1,
  uploaded_at    INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  thumbnail_path TEXT,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,
  file_id     TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  message_id  INTEGER NOT NULL,
  channel_id  TEXT NOT NULL,
  size        INTEGER NOT NULL,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS versions (
  id          TEXT PRIMARY KEY,
  file_id     TEXT NOT NULL,
  version_num INTEGER NOT NULL,
  size        INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL,
  label       TEXT,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trash (
  id            TEXT PRIMARY KEY,
  original_path TEXT NOT NULL,
  file_id       TEXT,
  folder_id     TEXT,
  file_data     TEXT,
  deleted_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
  id         TEXT PRIMARY KEY,
  direction  TEXT NOT NULL,
  status     TEXT NOT NULL,
  message_id INTEGER,
  synced_at  INTEGER NOT NULL,
  error      TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
`

export interface Folder {
  id: string
  parent_id: string | null
  name: string
  path: string
  created_at: number
  updated_at: number
}

export interface File {
  id: string
  folder_id: string
  name: string
  path: string
  size: number
  mime_type: string | null
  is_encrypted: number
  is_chunked: number
  chunk_count: number
  uploaded_at: number
  updated_at: number
  thumbnail_path: string | null
  starred: number
}

export interface Chunk {
  id: string
  file_id: string
  chunk_index: number
  message_id: number
  channel_id: string
  size: number
}

export interface Version {
  id: string
  file_id: string
  version_num: number
  size: number
  uploaded_at: number
  label: string | null
}

export interface TrashEntry {
  id: string
  original_path: string
  file_id: string | null
  folder_id: string | null
  file_data: string | null
  deleted_at: number
  expires_at: number
}

export interface Setting {
  key: string
  value: string
}

export interface SyncLog {
  id: string
  direction: 'push' | 'pull'
  status: 'success' | 'failed'
  message_id: number | null
  synced_at: number
  error: string | null
}
