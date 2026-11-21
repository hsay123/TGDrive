import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram'
import { getDb } from '../db/db'
import {
  deleteProtected,
  readProtected,
  writeProtected,
} from '../crypto/protected-store'

export const CHUNK_SIZE_MB = 512 * 1024

/**
 * Canonical shape for a Telegram user, produced ONLY by mapApiUser (main
 * process) and passed through the IPC bridge to the renderer untouched.
 * Unset fields are `null` — never `''`/`undefined` — so every consumer can
 * rely on a single convention.
 */
export interface TGUser {
  id: string
  firstName: string | null
  lastName: string | null
  username: string | null
  phone: string | null
}

let _client: TelegramClient | null = null
let _session: StringSession | null = null

/**
 * Read API credentials from the protected store (user-provided via Setup),
 * with .env as an optional dev-time fallback. They are no longer read from
 * plaintext settings rows.
 */
function getApiCredentials(): { apiId: number; apiHash: string } {
  const apiId = parseInt(
    readProtected('telegram_api_id') ?? process.env.TELEGRAM_API_ID ?? '',
    10
  )
  const apiHash =
    readProtected('telegram_api_hash') ?? process.env.TELEGRAM_API_HASH ?? ''

  if (!apiId || !apiHash) {
    throw new Error('Telegram API credentials not configured. Please complete setup.')
  }
  return { apiId, apiHash }
}

export function getSetting(key: string): string | undefined {
  const db = getDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

export function deleteSetting(key: string): void {
  const db = getDb()
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

/**
 * The single source of truth for mapping a raw Telegram user into the
 * canonical TGUser shape used everywhere (main process, IPC bridge, renderer
 * store). Do not re-map the user anywhere else.
 */
export function mapApiUser(user: Api.TypeUser): TGUser {
  if (!(user instanceof Api.User)) {
    throw new Error('Invalid user entity')
  }
  return {
    id: user.id.toString(),
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    username: user.username ?? null,
    phone: user.phone ?? null,
  }
}

export async function initClient(sessionString: string): Promise<TelegramClient> {
  try {
    if (_client) {
      return _client
    }

    const { apiId, apiHash } = getApiCredentials()
    _session = new StringSession(sessionString)
    _client = new TelegramClient(_session, apiId, apiHash, {
      connectionRetries: 5,
    })

    await _client.connect()
    // Warm the entity cache so PeerUser/PeerChannel lookups work without
    // triggering "Could not find input entity" on a cold session.
    await warmEntityCache()
    console.log(
      '[client] entity cache size after warm-up:',
      getEntityCacheSize(_client)
    )

    return _client
  } catch (error) {
    console.error('[client] initClient error:', error)
    await destroyClient()
    throw error
  }
}

/**
 * Re-initialize client with new credentials (called after user saves API creds in Setup).
 * Destroys any existing session so the new credentials take effect immediately.
 */
export async function reinitClient(): Promise<void> {
  await destroyClient()
  // Don't init a new client here — it will be lazily created on next auth:sendCode
}

/** Debug helper — gramjs EntityCache stores entries in a private cacheMap. */
export function getEntityCacheSize(client: TelegramClient): number | undefined {
  const cacheMap = (
    client as unknown as { _entityCache?: { cacheMap?: Map<unknown, unknown> } }
  )._entityCache?.cacheMap
  return cacheMap?.size
}

/**
 * Warm gramjs's in-memory entity cache.
 * Call once after a successful connect/login — and again defensively
 * before any download operation if a "Could not find input entity" error occurs.
 */
export async function warmEntityCache(): Promise<void> {
  const client = getClient()
  try {
    const me = await client.getMe()
    if (me) {
      console.log('[client] Warmed entity cache: self =', me.id?.toString())
    }

    await client.getDialogs({ limit: 100 })
    console.log('[client] Warmed entity cache: dialogs loaded')
  } catch (error) {
    console.error('[client] warmEntityCache failed (non-fatal):', error)
  }
}

export function getClient(): TelegramClient {
  if (!_client) {
    throw new Error('Telegram client is not initialized. Call initClient() first.')
  }
  return _client
}

export async function destroyClient(): Promise<void> {
  try {
    if (_client) {
      await _client.disconnect()
    }
  } catch (error) {
    console.error('[client] destroyClient error:', error)
  } finally {
    _client = null
    _session = null
  }
}

export function getSessionString(): string {
  if (!_session) {
    throw new Error('No active session. Client must be initialized first.')
  }
  return _session.save()
}

export function persistSession(): void {
  // OS-encrypted when available; otherwise the StringSession already lives in
  // `_session` for this run only. Never a plaintext settings row.
  writeProtected('telegram_session', getSessionString())
}

/** Remove any persisted session (and the in-memory copy of the stored value). */
export function clearPersistedSession(): void {
  deleteProtected('telegram_session')
}

/** Read the saved session string, or '' when the user must sign in again. */
export function getPersistedSession(): string {
  return readProtected('telegram_session') ?? ''
}

export async function ensureClientFromSettings(): Promise<TelegramClient> {
  return initClient(getPersistedSession())
}

export function getApiCredentialsExport(): { apiId: number; apiHash: string } {
  return getApiCredentials()
}
