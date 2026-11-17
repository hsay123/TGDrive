import { hasEncryptedFileRecords } from '../db/files.db'
import { hasEncryptedTrashRecords } from '../db/trash.db'
import { credentialStoreAvailable } from './secure-store'
import { getEncryptionKey, getExistingEncryptionKey } from './keystore'

export type EncryptionBlockedReason =
  | 'NO_SECURE_STORE'
  | 'KEY_MISSING_WITH_ENCRYPTED_DATA'

export interface KeyGuardDeps {
  storeAvailable: () => boolean
  hasEncryptedRecords: () => boolean
  hasKey: () => Promise<boolean>
  /** Returns the existing key, or creates one only when none exists. */
  getOrCreateKey: () => Promise<Buffer>
}

export interface EncryptionReadiness {
  storeAvailable: boolean
  hasEncryptedRecords: boolean
  hasKey: boolean
  canEnable: boolean
  blockedReason: EncryptionBlockedReason | null
  message: string | null
}

export class EncryptionKeyError extends Error {
  readonly code: EncryptionBlockedReason

  constructor(code: EncryptionBlockedReason, message: string) {
    super(message)
    this.name = 'EncryptionKeyError'
    this.code = code
  }
}

const NO_STORE_MESSAGE =
  'Encryption is unavailable: no secure key store is reachable. On Linux install libsecret-1-0 and start your keyring. TeleVault will never use a temporary per-launch key.'
const KEY_LOST_MESSAGE =
  'Encrypted files exist, but the encryption key is missing from the OS key store. TeleVault has stopped instead of creating a new key. Your encrypted files cannot be read until the original key is restored. Do not re-upload or re-encrypt them.'

export function defaultKeyGuardDeps(): KeyGuardDeps {
  return {
    storeAvailable: () => credentialStoreAvailable(),
    hasEncryptedRecords: () => hasEncryptedFileRecords() || hasEncryptedTrashRecords(),
    hasKey: async () => (await getExistingEncryptionKey()) !== null,
    getOrCreateKey: () => getEncryptionKey(),
  }
}

/** Dependency-injected so the guard can be unit-tested without native modules. */
export async function checkEncryptionReadiness(
  deps: KeyGuardDeps = defaultKeyGuardDeps()
): Promise<EncryptionReadiness> {
  const storeAvailable = deps.storeAvailable()
  const hasEncryptedRecords = deps.hasEncryptedRecords()
  const hasKey = storeAvailable ? await deps.hasKey() : false

  if (!storeAvailable) {
    return {
      storeAvailable,
      hasEncryptedRecords,
      hasKey,
      canEnable: false,
      blockedReason: 'NO_SECURE_STORE',
      message: NO_STORE_MESSAGE,
    }
  }

  if (hasEncryptedRecords && !hasKey) {
    return {
      storeAvailable,
      hasEncryptedRecords,
      hasKey,
      canEnable: false,
      blockedReason: 'KEY_MISSING_WITH_ENCRYPTED_DATA',
      message: KEY_LOST_MESSAGE,
    }
  }

  return {
    storeAvailable,
    hasEncryptedRecords,
    hasKey,
    canEnable: true,
    blockedReason: null,
    message: null,
  }
}

/**
 * Resolve the key for a new encrypted upload. Refuses before any key creation
 * when encrypted data exists but its key is gone, and refuses when no secure
 * store is available (no ephemeral fallback).
 */
export async function getKeyForEncryption(
  deps: KeyGuardDeps = defaultKeyGuardDeps()
): Promise<Buffer> {
  const status = await checkEncryptionReadiness(deps)
  if (status.blockedReason && status.message) {
    throw new EncryptionKeyError(status.blockedReason, status.message)
  }
  return deps.getOrCreateKey()
}
