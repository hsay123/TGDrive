import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getClient } from '../telegram/client'
import { getChannelEntity } from '../telegram/channels'
import { withRetry } from '../telegram/ratelimit'
import { setSetting } from '../db/settings.db'
import { getDb } from '../db/db'
import { buildIndexSnapshot, serializeIndex } from './indexer'

export async function pushIndex(): Promise<{ messageId: number }> {
  try {
    const snapshot = buildIndexSnapshot()
    const compressed = serializeIndex(snapshot)
    const tempPath = path.join(os.tmpdir(), `televault-index-${uuidv4()}.json.gz`)
    await fs.promises.writeFile(tempPath, compressed)

    const client = getClient()
    const entity = await getChannelEntity('index')

    const message = await withRetry(() =>
      client.sendFile(entity, {
        file: tempPath,
        caption: JSON.stringify({
          tv: true,
          type: 'index',
          exportedAt: snapshot.exportedAt,
        }),
        forceDocument: true,
      })
    )

    setSetting('last_index_message_id', String(message.id))

    const db = getDb()
    db.prepare(
      `INSERT INTO sync_log (id, direction, status, message_id, synced_at, error)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), 'push', 'success', message.id, Date.now(), null)

    await fs.promises.unlink(tempPath).catch(() => {})

    return { messageId: message.id }
  } catch (error) {
    const db = getDb()
    db.prepare(
      `INSERT INTO sync_log (id, direction, status, message_id, synced_at, error)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      'push',
      'failed',
      null,
      Date.now(),
      error instanceof Error ? error.message : String(error)
    )
    console.error('[pusher] pushIndex error:', error)
    throw error
  }
}
