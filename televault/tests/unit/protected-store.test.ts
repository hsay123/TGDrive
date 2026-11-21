import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const USERDATA = '/tmp/tv-test-protected-store'
const STORE_FILE = path.join(USERDATA, 'protected-credentials.json')
const { state } = vi.hoisted(() => ({
  state: { backend: 'gnome_libsecret', available: true },
}))

vi.mock('electron', () => ({
  app: { getPath: () => USERDATA },
  safeStorage: {
    getSelectedStorageBackend: () => state.backend,
    isEncryptionAvailable: () => state.available,
    // Fake reversible encoding — this test never uses a real OS key store.
    encryptString: (value: string) =>
      Buffer.from(`fake-encrypted:${Buffer.from(value).toString('base64')}`),
    decryptString: (encrypted: Buffer) => {
      const text = encrypted.toString()
      if (!text.startsWith('fake-encrypted:')) throw new Error('bad ciphertext')
      return Buffer.from(text.slice('fake-encrypted:'.length), 'base64').toString()
    },
  },
}))

// Fake seeded values only — never real credentials.
const FAKE_HASH = 'FAKE_API_HASH_VALUE_FOR_TESTS'
const FAKE_SESSION = 'FAKE_SESSION_VALUE_FOR_TESTS'

type Store = typeof import('../../core/crypto/protected-store')
let store: Store

beforeEach(async () => {
  vi.resetModules()
  fs.rmSync(USERDATA, { recursive: true, force: true })
  fs.mkdirSync(USERDATA, { recursive: true })
  state.backend = 'gnome_libsecret'
  state.available = true
  store = await import('../../core/crypto/protected-store')
})

afterEach(() => {
  fs.rmSync(USERDATA, { recursive: true, force: true })
})

describe('safeStorage credential store', () => {
  it('persists an OS-encrypted value that survives a restart', async () => {
    expect(store.getCredentialStorageStatus().persisted).toBe(true)
    expect(store.writeProtected('telegram_api_hash', FAKE_HASH)).toBe(true)

    const raw = fs.readFileSync(STORE_FILE)
    expect(raw.includes(Buffer.from(FAKE_HASH))).toBe(false)

    vi.resetModules()
    const reopened: Store = await import('../../core/crypto/protected-store')
    expect(reopened.readProtected('telegram_api_hash')).toBe(FAKE_HASH)
    expect(reopened.hasProtected('telegram_api_hash')).toBe(true)
  })

  it('keeps values in memory only with the Linux basic_text backend', () => {
    state.backend = 'basic_text'
    state.available = false
    const status = store.getCredentialStorageStatus()

    expect(status.persisted).toBe(false)
    expect(status.message).toContain('gnome-keyring or kwallet')
    expect(store.writeProtected('telegram_session', FAKE_SESSION)).toBe(false)
    expect(store.readProtected('telegram_session')).toBe(FAKE_SESSION)
    expect(fs.existsSync(STORE_FILE)).toBe(false)
  })

  it('does not silently fall back to plaintext when safeStorage is unavailable', () => {
    state.available = false
    expect(store.getCredentialStorageStatus().persisted).toBe(false)
    expect(store.writeProtected('telegram_api_hash', FAKE_HASH)).toBe(false)
    expect(fs.existsSync(STORE_FILE)).toBe(false)
  })

  it('deletes a protected value without leaving plaintext behind', () => {
    store.writeProtected('telegram_api_hash', FAKE_HASH)
    store.deleteProtected('telegram_api_hash')
    expect(store.readProtected('telegram_api_hash')).toBeNull()
    const raw = fs.readFileSync(STORE_FILE)
    expect(raw.includes(Buffer.from(FAKE_HASH))).toBe(false)
  })
})
