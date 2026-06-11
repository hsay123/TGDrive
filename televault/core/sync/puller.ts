import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getClient } from '../telegram/client'
import { getChannelEntity } from '../telegram/channels'
import { withRetry } from '../telegram/ratelimit'
import { getSetting, setSetting } from '../db/settings.db'
import { getDb } from '../db/db'
import { deserializeIndex } from './indexer'

export async function pullIndex(): Promise<void> {
  try {
    const messageIdStr = getSetting('last_index_message_id')
    if (!messageIdStr) {
      throw new Error('No index snapshot found. Push an index first.')
    }

    const messageId = parseInt(messageIdStr, 10)
    const client = getClient()
    const entity = await getChannelEntity('index')

    const messages = await withRetry(() =>
      client.getMessages(entity, { ids: messageId })
    )
    const message = messages[0]
    if (!message) {
      throw new Error(`Index message not found: ${messageId}`)
    }

    const tempPath = path.join(os.tmpdir(), `televault-index-pull-${uuidv4()}.bin`)
    await withRetry(() =>
      client.downloadMedia(message, { outputFile: tempPath })
    )

    const buffer = await fs.promises.readFile(tempPath)
    const snapshot = deserializeIndex(buffer)
    const db = getDb()

    const rebuild = db.transaction(() => {
      db.prepare('DELETE FROM chunks').run()
      db.prepare('DELETE FROM versions').run()
      db.prepare('DELETE FROM files').run()
      db.prepare('DELETE FROM folders').run()

      const insertFolder = db.prepare(
        `INSERT INTO folders (id, parent_id, name, path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const folder of snapshot.folders) {
        insertFolder.run(
          folder.id,
          folder.parent_id,
          folder.name,
          folder.path,
          folder.created_at,
          folder.updated_at
        )
      }

      const insertFile = db.prepare(
        `INSERT INTO files (
          id, folder_id, name, path, size, mime_type,
          is_encrypted, is_chunked, chunk_count,
          uploaded_at, updated_at, thumbnail_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const file of snapshot.files) {
        insertFile.run(
          file.id,
          file.folder_id,
          file.name,
          file.path,
          file.size,
          file.mime_type,
          file.is_encrypted,
          file.is_chunked,
          file.chunk_count,
          file.uploaded_at,
          file.updated_at,
          file.thumbnail_path
        )
      }

      const insertChunk = db.prepare(
        `INSERT INTO chunks (id, file_id, chunk_index, message_id, channel_id, size)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const chunk of snapshot.chunks) {
        insertChunk.run(
          chunk.id,
          chunk.file_id,
          chunk.chunk_index,
          chunk.message_id,
          chunk.channel_id,
          chunk.size
        )
      }

      const insertVersion = db.prepare(
        `INSERT INTO versions (id, file_id, version_num, size, uploaded_at, label)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      for (const version of snapshot.versions) {
        insertVersion.run(
          version.id,
          version.file_id,
          version.version_num,
          version.size,
          version.uploaded_at,
          version.label
        )
      }

      for (const setting of snapshot.settings) {
        if (setting.key !== 'telegram_session') {
          setSetting(setting.key, setting.value)
        }
      }
    })

    rebuild()

    db.prepare(
      `INSERT INTO sync_log (id, direction, status, message_id, synced_at, error)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), 'pull', 'success', messageId, Date.now(), null)

    await fs.promises.unlink(tempPath).catch(() => {})
  } catch (error) {
    const db = getDb()
    db.prepare(
      `INSERT INTO sync_log (id, direction, status, message_id, synced_at, error)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      'pull',
      'failed',
      null,
      Date.now(),
      error instanceof Error ? error.message : String(error)
    )
    console.error('[puller] pullIndex error:', error)
    throw error
  }
}

export interface SyncStatus {
  lastPush: number | null
  lastPull: number | null
  lastPushStatus: 'success' | 'failed' | null
  lastPullStatus: 'success' | 'failed' | null
}

export function getSyncStatus(): SyncStatus {
  const db = getDb()

  const lastPush = db
    .prepare(
      `SELECT synced_at, status FROM sync_log WHERE direction = 'push'
       ORDER BY synced_at DESC LIMIT 1`
    )
    .get() as { synced_at: number; status: string } | undefined

  const lastPull = db
    .prepare(
      `SELECT synced_at, status FROM sync_log WHERE direction = 'pull'
       ORDER BY synced_at DESC LIMIT 1`
    )
    .get() as { synced_at: number; status: string } | undefined

  return {
    lastPush: lastPush?.synced_at ?? null,
    lastPull: lastPull?.synced_at ?? null,
    lastPushStatus: (lastPush?.status as 'success' | 'failed') ?? null,
    lastPullStatus: (lastPull?.status as 'success' | 'failed') ?? null,
  }
}
