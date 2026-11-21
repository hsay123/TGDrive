import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Protected storage for Telegram credentials (session string, API ID and API
 * hash). Values are encrypted with Electron safeStorage and kept in a small
 * JSON file under userData. Plaintext is NEVER written to SQLite settings,
 * backups or this file.
 *
 * When no real OS-backed key store is available (Linux 'basic_text' backend,
 * or safeStorage failures), values live only in the `memory` map for the
 * current process. Nothing is persisted, and the UI tells the user they must
 * sign in again next launch. There is deliberately no plaintext fallback.
 */
export type ProtectedKey = 'telegram_session' | 'telegram_api_id' | 'telegram_api_hash'

const STORE_FILE = 'protected-credentials.json'
const memory = new Map<ProtectedKey, string>()

export interface CredentialStorageStatus {
  /** True when values can be persisted with OS-backed encryption. */
  persisted: boolean
  backend: string
  /** User-facing explanation when persistence is unavailable; null otherwise. */
  message: string | null
}

function backend(): string {
  try {
    return safeStorage.getSelectedStorageBackend()
  } catch {
    return 'unknown'
  }
}

/** safeStorage may exist but use an unencrypted basic_text backend on Linux. */
function canPersist(): boolean {
  try {
    if (backend() === 'basic_text') return false
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function storePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE)
}

type StoredValues = Partial<Record<ProtectedKey, string>>

function readStore(): StoredValues {
  try {
    const raw = fs.readFileSync(storePath(), 'utf-8')
    const parsed = JSON.parse(raw) as StoredValues
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(values: StoredValues): void {
  fs.writeFileSync(storePath(), JSON.stringify(values), { mode: 0o600 })
}

export function getCredentialStorageStatus(): CredentialStorageStatus {
  const selected = backend()
  if (canPersist()) {
    return { persisted: true, backend: selected, message: null }
  }

  const message =
    selected === 'basic_text'
      ? 'No secure credential store is available (Linux is using the basic_text backend). TeleVault will keep your sign-in for this session only — you will have to sign in again next time. Install gnome-keyring or kwallet and restart TeleVault to persist it.'
      : 'No secure credential store is available. TeleVault will keep your sign-in for this session only — you will have to sign in again next time. On Linux, install gnome-keyring or kwallet and restart TeleVault.'

  return { persisted: false, backend: selected, message }
}

/** Read a value from the current process, or decrypt it from the protected file. */
export function readProtected(key: ProtectedKey): string | null {
  const cached = memory.get(key)
  if (cached !== undefined) return cached
  if (!canPersist()) return null

  const encrypted = readStore()[key]
  if (!encrypted) return null
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return null
  }
}

/**
 * Write a value. Returns true only when it was OS-encrypted and persisted;
 * false means it is held in memory for this run only.
 */
export function writeProtected(key: ProtectedKey, value: string): boolean {
  if (!canPersist()) {
    memory.set(key, value)
    return false
  }

  try {
    const values = readStore()
    values[key] = safeStorage.encryptString(value).toString('base64')
    writeStore(values)
    memory.delete(key)
    return true
  } catch {
    // Never write plaintext as a fallback. In-memory only for this run.
    memory.set(key, value)
    return false
  }
}

export function deleteProtected(key: ProtectedKey): void {
  memory.delete(key)
  const values = readStore()
  if (key in values) {
    delete values[key]
    try {
      writeStore(values)
    } catch {
      // Best-effort; the in-memory copy is gone and no plaintext was written.
    }
  }
}

export function hasProtected(...keys: ProtectedKey[]): boolean {
  return keys.every((key) => readProtected(key) !== null)
}
