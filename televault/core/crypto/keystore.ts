import crypto from 'crypto'
import { getSecret, setSecret, deleteSecret } from './secure-store'

const SERVICE = 'televault'
const ACCOUNT = 'encryption-key'

/** Read the key without ever creating one. Used by guards and UI status. */
export async function getExistingEncryptionKey(): Promise<Buffer | null> {
  try {
    const existing = await getSecret(SERVICE, ACCOUNT)
    return existing ? Buffer.from(existing, 'hex') : null
  } catch (error) {
    console.error('[keystore] getExistingEncryptionKey error:', error)
    throw error
  }
}

/**
 * Create a key only for the first encrypted upload. All other callers must use
 * `getExistingEncryptionKey()` or the key-guard so a lost key is never replaced
 * silently.
 */
export async function getEncryptionKey(): Promise<Buffer> {
  try {
    const existing = await getExistingEncryptionKey()
    if (existing) return existing

    const newKey = crypto.randomBytes(32)
    await setSecret(SERVICE, ACCOUNT, newKey.toString('hex'))
    return newKey
  } catch (error) {
    console.error('[keystore] getEncryptionKey error:', error)
    throw error
  }
}

export async function rotateEncryptionKey(): Promise<Buffer> {
  try {
    const newKey = crypto.randomBytes(32)
    await setSecret(SERVICE, ACCOUNT, newKey.toString('hex'))
    return newKey
  } catch (error) {
    console.error('[keystore] rotateEncryptionKey error:', error)
    throw error
  }
}

export async function hasEncryptionKey(): Promise<boolean> {
  try {
    const existing = await getSecret(SERVICE, ACCOUNT)
    return existing !== null
  } catch (error) {
    console.error('[keystore] hasEncryptionKey error:', error)
    throw error
  }
}

export async function getKeyFingerprint(): Promise<string> {
  try {
    // Reading settings must not create a key. An empty string means "no key yet".
    const key = await getExistingEncryptionKey()
    return key ? key.subarray(0, 8).toString('hex').toUpperCase() : ''
  } catch (error) {
    console.error('[keystore] getKeyFingerprint error:', error)
    throw error
  }
}

export async function deleteEncryptionKey(): Promise<void> {
  try {
    await deleteSecret(SERVICE, ACCOUNT)
  } catch (error) {
    console.error('[keystore] deleteEncryptionKey error:', error)
    throw error
  }
}
