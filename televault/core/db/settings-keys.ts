import type { Setting } from './schema'

/**
 * The only settings keys that may cross a device boundary through an Index
 * channel snapshot. Everything else is local-only: credentials, channel IDs
 * and access hashes, cached user data and local file paths must never be
 * uploaded, and must never be overwritten by a snapshot received from another
 * device (or from an attacker who can post to the Index channel).
 */
export const SNAPSHOT_SETTING_KEYS = [
  'auto_sync_interval',
  'encryption_enabled',
] as const

const ALLOWED = new Set<string>(SNAPSHOT_SETTING_KEYS)

/** Returns only well-formed allowlisted rows. Unknown keys and values are dropped. */
export function filterSnapshotSettings(settings: unknown): Setting[] {
  if (!Array.isArray(settings)) return []

  const filtered: Setting[] = []
  for (const row of settings) {
    if (typeof row !== 'object' || row === null) continue
    const key = (row as { key?: unknown }).key
    const value = (row as { value?: unknown }).value
    if (typeof key === 'string' && typeof value === 'string' && ALLOWED.has(key)) {
      filtered.push({ key, value })
    }
  }
  return filtered
}
