import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'

const USERDATA = '/tmp/tv-test-puller-allowlist'
const { downloaded } = vi.hoisted(() => ({ downloaded: { current: Buffer.alloc(0) } }))

vi.mock('electron', () => ({ app: { getPath: () => USERDATA } }))
vi.mock('../../core/telegram/client', () => ({
  getClient: () => ({
    getMessages: async () => [{}],
    downloadMedia: async (_message: unknown, options: { outputFile: string }) => {
      await fs.promises.writeFile(options.outputFile, downloaded.current)
    },
  }),
}))
vi.mock('../../core/telegram/channels', () => ({
  getChannelEntity: async () => ({ id: 'fake-index-channel' }),
}))
vi.mock('../../core/telegram/ratelimit', () => ({
  withRetry: (fn: () => unknown) => fn(),
}))
vi.mock('../../core/db/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/db/db')>()
  return {
    ...actual,
    backupDatabaseBeforePull: vi.fn(async () => '/tmp/fake-backup.db'),
  }
})

import { closeDb } from '../../core/db/db'
import { getSetting, setSetting } from '../../core/db/settings.db'
import { serializeIndex, type IndexSnapshot } from '../../core/sync/indexer'
import { pullIndex } from '../../core/sync/puller'

// Fake, seeded values only — never real credentials.
const LOCAL = {
  session: 'LOCAL_FAKE_SESSION',
  apiId: '1111111',
  apiHash: 'localfakehash',
  channelId: 'local-fake-channel-id',
  channelHash: 'local-fake-access-hash',
}
const HOSTILE = {
  session: 'HOSTILE_FAKE_SESSION',
  apiHash: 'hostilefakehash',
  apiId: '2222222',
  channelId: 'hostile-fake-channel-id',
}

beforeAll(() => {
  fs.rmSync(USERDATA, { recursive: true, force: true })
  fs.mkdirSync(USERDATA, { recursive: true })
})

afterAll(() => {
  closeDb()
  fs.rmSync(USERDATA, { recursive: true, force: true })
})

describe('puller settings allowlist', () => {
  it('cannot overwrite secrets or private-channel settings from a snapshot', async () => {
    setSetting('telegram_session', LOCAL.session)
    setSetting('telegram_api_id', LOCAL.apiId)
    setSetting('telegram_api_hash', LOCAL.apiHash)
    setSetting('storage_channel_id', LOCAL.channelId)
    setSetting('storage_channel_access_hash', LOCAL.channelHash)
    setSetting('last_index_message_id', '7')

    const hostileSnapshot: IndexSnapshot = {
      version: 1,
      exportedAt: Date.now(),
      folders: [],
      files: [],
      chunks: [],
      versions: [],
      settings: [
        { key: 'telegram_session', value: HOSTILE.session },
        { key: 'telegram_api_id', value: HOSTILE.apiId },
        { key: 'telegram_api_hash', value: HOSTILE.apiHash },
        { key: 'storage_channel_id', value: HOSTILE.channelId },
        { key: 'storage_channel_access_hash', value: HOSTILE.channelId },
        { key: 'last_user', value: '{"phone":"+10000000000"}' },
        { key: 'avatar_path', value: '/tmp/hostile-avatar' },
        { key: 'auto_sync_interval', value: '12345' },
      ],
    }
    downloaded.current = serializeIndex(hostileSnapshot)

    await pullIndex()

    expect(getSetting('telegram_session')).toBe(LOCAL.session)
    expect(getSetting('telegram_api_id')).toBe(LOCAL.apiId)
    expect(getSetting('telegram_api_hash')).toBe(LOCAL.apiHash)
    expect(getSetting('storage_channel_id')).toBe(LOCAL.channelId)
    expect(getSetting('storage_channel_access_hash')).toBe(LOCAL.channelHash)
    expect(getSetting('auto_sync_interval')).toBe('12345')
  })
})
