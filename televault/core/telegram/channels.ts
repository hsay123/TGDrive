import { Api } from 'telegram'
import bigInt from 'big-integer'
import { getClient, getSetting, setSetting } from './client'
import { withRetry } from './ratelimit'

export type ChannelPurpose = 'storage' | 'index' | 'trash'

const CHANNEL_TITLES: Record<ChannelPurpose, string> = {
  storage: 'TeleVault Storage',
  index: 'TeleVault Index',
  trash: 'TeleVault Trash',
}

const CHANNEL_ID_KEYS: Record<ChannelPurpose, string> = {
  storage: 'storage_channel_id',
  index: 'index_channel_id',
  trash: 'trash_channel_id',
}

const CHANNEL_HASH_KEYS: Record<ChannelPurpose, string> = {
  storage: 'storage_channel_access_hash',
  index: 'index_channel_access_hash',
  trash: 'trash_channel_access_hash',
}

// In-memory cache: purpose → resolved InputPeerChannel (valid for this session)
const entityCache = new Map<ChannelPurpose, Api.InputPeerChannel>()

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildInputPeer(purpose: ChannelPurpose): Api.InputPeerChannel | null {
  const channelId = getSetting(CHANNEL_ID_KEYS[purpose])
  const accessHash = getSetting(CHANNEL_HASH_KEYS[purpose])
  if (!channelId || !accessHash) return null

  return new Api.InputPeerChannel({
    channelId: bigInt(channelId),
    accessHash: bigInt(accessHash),
  })
}

// ─── Create channel ───────────────────────────────────────────────────────────

async function createPrivateChannel(
  title: string
): Promise<{ id: string; accessHash: string }> {
  console.log(`[channels] Creating channel: "${title}"`)
  try {
    const client = getClient()

    const result = await withRetry(() =>
      client.invoke(
        new Api.channels.CreateChannel({
          title,
          about: 'TeleVault internal storage — do not modify',
          broadcast: true,
          megagroup: false,
        })
      )
    )

    if (!('chats' in result) || !result.chats) {
      throw new Error(`CreateChannel response missing chats for: ${title}`)
    }

    const channel = result.chats.find(
      (chat): chat is Api.Channel => chat instanceof Api.Channel
    )

    if (!channel) {
      throw new Error(
        `No Api.Channel in response for: ${title}. Got: ${JSON.stringify(
          result.chats.map((c) => c.className)
        )}`
      )
    }

    if (!channel.accessHash) {
      throw new Error(`Channel "${title}" created but accessHash is missing in response`)
    }

    const id = channel.id.toString()
    const accessHash = channel.accessHash.toString()
    console.log(`[channels] Created channel "${title}" → id=${id}, accessHash=${accessHash.slice(0, 6)}…`)
    return { id, accessHash }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(`[channels] createPrivateChannel("${title}") failed:`, msg)
    if (msg.includes('CHANNELS_TOO_MUCH')) {
      throw new Error(
        'Your Telegram account has reached its channel limit. Please leave or delete some channels in Telegram and try again.'
      )
    }
    throw error
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getChannelId(purpose: ChannelPurpose): Promise<string> {
  const channelId = getSetting(CHANNEL_ID_KEYS[purpose])
  if (!channelId) {
    throw new Error(`Channel not initialized for purpose: ${purpose}`)
  }
  return channelId
}

/**
 * Returns a resolved InputPeerChannel for a given purpose.
 *
 * Tries (in order):
 * 1. In-memory session cache (fast path)
 * 2. Build from stored ID + accessHash (reliable, works after restart)
 * 3. Resolve via getEntity (requires gramjs entity cache; may fail after restart)
 */
export async function getChannelEntity(purpose: ChannelPurpose): Promise<Api.InputPeerChannel> {
  // 1. In-memory cache
  const cached = entityCache.get(purpose)
  if (cached) return cached

  // 2. Build from stored ID + accessHash
  const peer = buildInputPeer(purpose)
  if (peer) {
    entityCache.set(purpose, peer)
    console.log(`[channels] Resolved entity for "${purpose}" from stored credentials`)
    return peer
  }

  // 3. No accessHash stored yet — try to backfill first, then build
  console.warn(`[channels] No accessHash for "${purpose}" — attempting backfill…`)
  await backfillAccessHashes()

  const peerAfterBackfill = buildInputPeer(purpose)
  if (peerAfterBackfill) {
    entityCache.set(purpose, peerAfterBackfill)
    return peerAfterBackfill
  }

  throw new Error(
    `Could not resolve Telegram entity for "${purpose}" channel. ` +
      'The access hash is missing. Please go to Settings → Re-initialize Channels.'
  )
}

export function channelsReady(): { ready: boolean; missing: string[] } {
  const required = Object.values(CHANNEL_ID_KEYS) as string[]
  const missing = required.filter((key) => !getSetting(key))
  return { ready: missing.length === 0, missing }
}

/**
 * Backfill accessHash for channels that were created before this fix.
 * Fetches all dialogs and matches them by channel ID.
 */
export async function backfillAccessHashes(): Promise<void> {
  const client = getClient()
  const purposes: ChannelPurpose[] = ['storage', 'index', 'trash']
  const needsBackfill = purposes.filter(
    (p) => getSetting(CHANNEL_ID_KEYS[p]) && !getSetting(CHANNEL_HASH_KEYS[p])
  )

  if (needsBackfill.length === 0) return
  console.log(`[channels] Backfilling accessHash for: ${needsBackfill.join(', ')}`)

  try {
    // getDialogs populates gramjs's entity cache and gives us the accessHash
    const dialogs = await withRetry(() => client.getDialogs({ limit: 200 }))

    for (const purpose of needsBackfill) {
      const channelId = getSetting(CHANNEL_ID_KEYS[purpose])!
      const match = dialogs.find(
        (d) => d.entity && d.entity.id?.toString() === channelId
      )

      if (match && match.entity instanceof Api.Channel && match.entity.accessHash) {
        const accessHash = match.entity.accessHash.toString()
        setSetting(CHANNEL_HASH_KEYS[purpose], accessHash)
        console.log(`[channels] Backfilled accessHash for "${purpose}" channel (${channelId})`)

        // Also prime the in-memory cache now
        entityCache.set(
          purpose,
          new Api.InputPeerChannel({
            channelId: bigInt(channelId),
            accessHash: bigInt(accessHash),
          })
        )
      } else {
        console.warn(
          `[channels] Could not find "${purpose}" channel (${channelId}) in dialogs. ` +
            'It may have been deleted from Telegram.'
        )
      }
    }
  } catch (err) {
    console.error('[channels] backfillAccessHashes error:', err)
    // Non-fatal — downstream errors will surface a clearer message
  }
}

/**
 * Initialize channels — creates any missing ones and stores ID + accessHash.
 * Safe to call multiple times (idempotent).
 */
export async function initializeChannels(): Promise<{
  storageChannelId: string
  indexChannelId: string
  trashChannelId: string
}> {
  console.log('[channels] Initializing TeleVault channels…')

  // First, backfill any missing accessHashes for channels created before this fix
  await backfillAccessHashes()

  try {
    const purposes: ChannelPurpose[] = ['storage', 'index', 'trash']
    const result: Record<string, string> = {}

    for (const purpose of purposes) {
      const idKey = CHANNEL_ID_KEYS[purpose]
      let channelId = getSetting(idKey)

      if (!channelId) {
        const created = await createPrivateChannel(CHANNEL_TITLES[purpose])
        channelId = created.id

        setSetting(idKey, channelId)
        setSetting(CHANNEL_HASH_KEYS[purpose], created.accessHash)
        console.log(`[channels] Saved ${idKey} = ${channelId}`)
      } else {
        console.log(
          `[channels] ${CHANNEL_TITLES[purpose]} already exists (${channelId}), skipping`
        )
      }

      result[`${purpose}ChannelId`] = channelId
    }

    console.log('[channels] Channels initialized successfully:', result)
    return {
      storageChannelId: result.storageChannelId,
      indexChannelId: result.indexChannelId,
      trashChannelId: result.trashChannelId,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[channels] initializeChannels FAILED:', msg)
    console.error('[channels] Stack:', error instanceof Error ? error.stack : '')
    throw new Error(`Failed to initialize Telegram channels: ${msg}`)
  }
}

/** Clear the session-level entity cache (e.g. after logout) */
export function clearEntityCache(): void {
  entityCache.clear()
}
