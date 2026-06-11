import keytar from 'keytar'
import crypto from 'crypto'

const SERVICE = 'televault'
const ACCOUNT = 'encryption-key'

export async function getEncryptionKey(): Promise<Buffer> {
  try {
    const existing = await keytar.getPassword(SERVICE, ACCOUNT)
    if (existing) {
      return Buffer.from(existing, 'hex')
    }

    const newKey = crypto.randomBytes(32)
    await keytar.setPassword(SERVICE, ACCOUNT, newKey.toString('hex'))
    return newKey
  } catch (error) {
    console.error('[keystore] getEncryptionKey error:', error)
    throw error
  }
}

export async function rotateEncryptionKey(): Promise<Buffer> {
  try {
    const newKey = crypto.randomBytes(32)
    await keytar.setPassword(SERVICE, ACCOUNT, newKey.toString('hex'))
    return newKey
  } catch (error) {
    console.error('[keystore] rotateEncryptionKey error:', error)
    throw error
  }
}

export async function hasEncryptionKey(): Promise<boolean> {
  try {
    const existing = await keytar.getPassword(SERVICE, ACCOUNT)
    return existing !== null
  } catch (error) {
    console.error('[keystore] hasEncryptionKey error:', error)
    throw error
  }
}

export async function getKeyFingerprint(): Promise<string> {
  try {
    const key = await getEncryptionKey()
    return key.subarray(0, 8).toString('hex').toUpperCase()
  } catch (error) {
    console.error('[keystore] getKeyFingerprint error:', error)
    throw error
  }
}

export async function deleteEncryptionKey(): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE, ACCOUNT)
  } catch (error) {
    console.error('[keystore] deleteEncryptionKey error:', error)
    throw error
  }
}
