import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const USERDATA = '/tmp/tv-test-userdata-db'

vi.mock('electron', () => ({
  app: { getPath: () => USERDATA },
  safeStorage: {
    getSelectedStorageBackend: () => 'basic_text',
    isEncryptionAvailable: () => false,
  },
}))

import { getDb, closeDb } from '../../core/db/db'
import {
  readProtected,
  writeProtected,
} from '../../core/crypto/protected-store'

// The "restart" test calls vi.resetModules(), which creates a second db module
// instance with its own open connection. Keep a handle so teardown can close it
// too — on Windows an open SQLite handle makes rmSync(televault.db) fail EBUSY.
let closeReopenedDb: (() => void) | undefined

beforeAll(() => {
  fs.rmSync(USERDATA, { recursive: true, force: true })
  fs.mkdirSync(USERDATA, { recursive: true })
})

afterAll(() => {
  closeReopenedDb?.()
  closeDb()
  fs.rmSync(USERDATA, { recursive: true, force: true })
})

describe('userData / path handling', () => {
  it('creates the database under app-data, not the working directory', () => {
    const db = getDb()
    const expected = path.join(USERDATA, 'televault.db')
    expect(fs.existsSync(expected)).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'televault.db'))).toBe(false)
    expect(db.name).toBe(expected)
  })

  it('never writes the Telegram session as a plaintext setting (no-keyring path)', () => {
    const fakeSession = 'FAKE_SESSION_VALUE_FOR_TESTS'
    // Fake seeded value only — never a real credential.
    const persisted = writeProtected('telegram_session', fakeSession)

    expect(persisted).toBe(false) // basic_text: memory-only, no plaintext fallback
    expect(readProtected('telegram_session')).toBe(fakeSession)

    const rows = getDb()
      .prepare("SELECT key, value FROM settings WHERE key LIKE '%session%' OR key LIKE '%telegram%'")
      .all() as Array<{ key: string; value: string }>
    expect(rows).toEqual([])

    const rawDb = fs.readFileSync(path.join(USERDATA, 'televault.db'))
    expect(rawDb.includes(Buffer.from(fakeSession))).toBe(false)
    expect(fs.existsSync(path.join(USERDATA, 'protected-credentials.json'))).toBe(false)
  })

  it('does not restore a memory-only session after a simulated restart', async () => {
    vi.resetModules()
    const { getDb: reopenDb, closeDb: closeReopened } = await import('../../core/db/db')
    closeReopenedDb = closeReopened
    const { readProtected: readAfterRestart } = await import('../../core/crypto/protected-store')

    expect(reopenDb().name).toBe(path.join(USERDATA, 'televault.db'))
    expect(readAfterRestart('telegram_session')).toBeNull()
  })
})
