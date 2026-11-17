import { describe, expect, it, vi } from 'vitest'

// key-guard's default dependencies reach native modules; the guard logic under
// test is injected, so stub the imports before the module is loaded.
vi.mock('../../core/db/files.db', () => ({ hasEncryptedFileRecords: vi.fn() }))
vi.mock('../../core/db/trash.db', () => ({ hasEncryptedTrashRecords: vi.fn() }))
vi.mock('../../core/crypto/secure-store', () => ({ credentialStoreAvailable: vi.fn() }))
vi.mock('../../core/crypto/keystore', () => ({
  getEncryptionKey: vi.fn(),
  getExistingEncryptionKey: vi.fn(),
  hasEncryptionKey: vi.fn(),
}))

import {
  checkEncryptionReadiness,
  EncryptionKeyError,
  getKeyForEncryption,
  type KeyGuardDeps,
} from '../../core/crypto/key-guard'
import { encryptBuffer } from '../../core/crypto/encrypt'
import { decryptBuffer } from '../../core/crypto/decrypt'

const KEY = Buffer.from('11'.repeat(32), 'hex')

function deps(overrides: Partial<KeyGuardDeps> = {}): KeyGuardDeps {
  return {
    storeAvailable: () => true,
    hasEncryptedRecords: () => false,
    hasKey: async () => true,
    getOrCreateKey: async () => KEY,
    ...overrides,
  }
}

describe('encryption key guard', () => {
  it('refuses when encrypted rows exist but the keychain entry is missing', async () => {
    const getOrCreateKey = vi.fn(async () => KEY)
    const guard = deps({
      hasEncryptedRecords: () => true,
      hasKey: async () => false,
      getOrCreateKey,
    })

    const status = await checkEncryptionReadiness(guard)
    expect(status.canEnable).toBe(false)
    expect(status.blockedReason).toBe('KEY_MISSING_WITH_ENCRYPTED_DATA')

    await expect(getKeyForEncryption(guard)).rejects.toBeInstanceOf(EncryptionKeyError)
    expect(getOrCreateKey).not.toHaveBeenCalled()
  })

  it('disables encryption and creates no key when there is no secure store', async () => {
    const getOrCreateKey = vi.fn(async () => KEY)
    const guard = deps({
      storeAvailable: () => false,
      hasKey: async () => false,
      getOrCreateKey,
    })

    const status = await checkEncryptionReadiness(guard)
    expect(status.canEnable).toBe(false)
    expect(status.blockedReason).toBe('NO_SECURE_STORE')

    await expect(getKeyForEncryption(guard)).rejects.toMatchObject({
      code: 'NO_SECURE_STORE',
    })
    expect(getOrCreateKey).not.toHaveBeenCalled()
  })

  it('allows a first key and round-trips data with the correct key', async () => {
    const getOrCreateKey = vi.fn(async () => KEY)
    const guard = deps({
      hasKey: async () => false,
      getOrCreateKey,
    })

    const key = await getKeyForEncryption(guard)
    expect(getOrCreateKey).toHaveBeenCalledTimes(1)
    expect(key).toEqual(KEY)

    const plain = Buffer.from('recovered by the original key')
    expect(decryptBuffer(encryptBuffer(plain, key), key)).toEqual(plain)
  })
})
