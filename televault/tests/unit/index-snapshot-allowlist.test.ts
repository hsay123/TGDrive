import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'

const USERDATA = '/tmp/tv-test-snapshot-allowlist'

vi.mock('electron', () => ({ app: { getPath: () => USERDATA } }))

import { closeDb } from '../../core/db/db'
import { setSetting } from '../../core/db/settings.db'
import {
  filterSnapshotSettings,
  SNAPSHOT_SETTING_KEYS,
} from '../../core/db/settings-keys'
import { buildIndexSnapshot, serializeIndex } from '../../core/sync/indexer'

// Fake, seeded values only — never real credentials.
const FAKE = {
  session: 'FAKE_SESSION_VALUE_FOR_TESTS',
  apiId: '1234567',
  apiHash: 'fakehash0123456789abcdef',
  channelId: 'fake-private-channel-id',
  channelHash: 'fake-channel-access-hash',
  userJson: '{"phone":"+10000000000"}',
}

beforeAll(() => {
  fs.rmSync(USERDATA, { recursive: true, force: true })
  fs.mkdirSync(USERDATA, { recursive: true })
})

afterAll(() => {
  closeDb()
  fs.rmSync(USERDATA, { recursive: true, force: true })
})

describe('index snapshot settings allowlist', () => {
  it('never serialises credential or sensitive setting keys/values', () => {
    setSetting('telegram_session', FAKE.session)
    setSetting('telegram_api_id', FAKE.apiId)
    setSetting('telegram_api_hash', FAKE.apiHash)
    setSetting('storage_channel_id', FAKE.channelId)
    setSetting('storage_channel_access_hash', FAKE.channelHash)
    setSetting('last_user', FAKE.userJson)
    setSetting('auto_sync_interval', '60000')
    setSetting('encryption_enabled', '1')

    const snapshot = buildIndexSnapshot()
    const raw = gunzipSync(serializeIndex(snapshot)).toString('utf-8')

    expect(snapshot.settings.length).toBeGreaterThan(0)
    for (const row of snapshot.settings) {
      expect(SNAPSHOT_SETTING_KEYS).toContain(row.key)
    }
    expect(snapshot.settings.map((row) => row.key)).toContain('auto_sync_interval')

    for (const needle of [
      'telegram_session',
      'telegram_api_id',
      'telegram_api_hash',
      'storage_channel_id',
      'storage_channel_access_hash',
      'last_user',
      FAKE.session,
      FAKE.apiId,
      FAKE.apiHash,
      FAKE.channelId,
      FAKE.channelHash,
      FAKE.userJson,
    ]) {
      expect(raw, `snapshot must not contain ${needle}`).not.toContain(needle)
    }
  })

  it('drops malformed and non-allowlisted rows from a snapshot', () => {
    expect(
      filterSnapshotSettings([
        { key: 'auto_sync_interval', value: '1000' },
        { key: 'telegram_session', value: 'FAKE' },
        { key: 'telegram_api_hash', value: 'FAKE' },
        { key: 'unknown_key', value: 'FAKE' },
        { key: 'auto_sync_interval', value: 42 },
        null,
      ])
    ).toEqual([{ key: 'auto_sync_interval', value: '1000' }])
    expect(filterSnapshotSettings('not-an-array')).toEqual([])
  })
})
