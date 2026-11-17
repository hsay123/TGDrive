import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const USERDATA = '/tmp/tv-test-userdata-db'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tv-test-userdata-db' },
}))

import { getDb } from '../../core/db/db'
import { getSetting, setSetting } from '../../core/db/settings.db'

beforeAll(() => {
  fs.rmSync(USERDATA, { recursive: true, force: true })
  fs.mkdirSync(USERDATA, { recursive: true })
})

afterAll(() => {
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

  it('stores the Telegram session as a plaintext setting', () => {
    setSetting('telegram_session', 'SESSION_VALUE_IS_NOT_ENCRYPTED')
    const raw = getDb()
      .prepare("SELECT value FROM settings WHERE key = 'telegram_session'")
      .get() as { value: string }
    expect(raw.value).toBe('SESSION_VALUE_IS_NOT_ENCRYPTED')
  })

  it('still reads the session after a simulated restart (module reload)', async () => {
    vi.resetModules()
    const { getDb: reopenDb } = await import('../../core/db/db')
    const { getSetting: readSetting } = await import('../../core/db/settings.db')

    expect(reopenDb().name).toBe(path.join(USERDATA, 'televault.db'))
    expect(readSetting('telegram_session')).toBe('SESSION_VALUE_IS_NOT_ENCRYPTED')
  })
})
