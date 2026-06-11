import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram'
import { getDb } from '../db/db'

export const CHUNK_SIZE_MB = 512 * 1024

export interface TGUser {
  id: string
  firstName: string
  lastName: string
  username: string
  phone: string
}

let _client: TelegramClient | null = null
let _session: StringSession | null = null

function getApiCredentials(): { apiId: number; apiHash: string } {
  const apiId = parseInt(process.env.TELEGRAM_API_ID ?? '', 10)
  const apiHash = process.env.TELEGRAM_API_HASH ?? ''
  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in environment')
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

export function mapApiUser(user: Api.TypeUser): TGUser {
  if (!(user instanceof Api.User)) {
    throw new Error('Invalid user entity')
  }
  return {
    id: user.id.toString(),
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    username: user.username ?? '',
    phone: user.phone ?? '',
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
    // Non-fatal if session is empty/stale — validity is checked in auth.ts.
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
  setSetting('telegram_session', getSessionString())
}

export async function ensureClientFromSettings(): Promise<TelegramClient> {
  const saved = getSetting('telegram_session') ?? ''
  return initClient(saved)
}

export function getApiCredentialsExport(): { apiId: number; apiHash: string } {
  return getApiCredentials()
}
