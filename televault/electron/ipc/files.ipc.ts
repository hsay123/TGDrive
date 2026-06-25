import { app } from 'electron'
import type { BrowserWindow, IpcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { execSync } from 'child_process'
import * as vfs from '../../core/fs/vfs'
import { getVersionsByFileId } from '../../core/db/versions.db'
import { getTrashedFiles } from '../../core/db/trash.db'
import {
  getFileById,
  getAllFiles,
  updateFileThumbnail,
} from '../../core/db/files.db'
import { downloadFile } from '../../core/telegram/downloader'
import type { Version } from '../../core/db/schema'
import { ipcResult } from './helpers'
import { initializeChannels, channelsReady } from '../../core/telegram/channels'

export interface VersionRow {
  id: string
  fileId: string
  versionNum: number
  size: number
  uploadedAt: number
  label: string | null
}

type DialogModule = typeof dialog

// Self-healing guard: if channels weren't created at login, create them now
async function ensureChannelsReady(): Promise<void> {
  const { ready, missing } = channelsReady()
  if (!ready) {
    console.log('[upload] Missing channel IDs:', missing, '— initializing now')
    await initializeChannels()
  }
}

function mapVersion(v: Version): VersionRow {
  return {
    id: v.id,
    fileId: v.file_id,
    versionNum: v.version_num,
    size: v.size,
    uploadedAt: v.uploaded_at,
    label: v.label,
  }
}

export function registerFilesIpc(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  dialogApi: DialogModule
): void {
  ipcMain.handle('files:list', async (_event, folderPath: string) =>
    ipcResult(() => vfs.listFolder(folderPath))
  )

  ipcMain.handle(
    'files:upload',
    async (
      _event,
      localPath: string,
      destFolderPath: string,
      encrypt: boolean
    ) =>
      ipcResult(async () => {
        // ── Disk space pre-check (technical limit — not a business limit) ──
        const fileSize = fsSync.statSync(localPath).size
        const CHUNK_SIZE = 512 * 1024 * 1024 // 512 MB (matches chunker)
        function getFreeDiskBytes(dir: string): number {
          try {
            const out = execSync(`df -k "${dir}" | tail -1 | awk '{print $4}'`).toString().trim()
            return parseInt(out) * 1024
          } catch { return Infinity }
        }
        const freeSpace = getFreeDiskBytes(app.getPath('userData'))
        const needed = Math.min(fileSize, CHUNK_SIZE)
        if (freeSpace < needed * 1.2) {
          throw new Error(
            `DISK_FULL:${JSON.stringify({ free: freeSpace, needed })}`
          )
        }

        // ── Upload ───────────────────────────────────────────────────────
        await ensureChannelsReady()
        const win = getMainWindow()
        return vfs.uploadFile({
          localPath,
          destFolderPath,
          encrypt,
          onProgress: (percent) => {
            win?.webContents.send('files:upload:progress', {
              localPath,
              percent,
            })
          },
        })
      })
  )

  ipcMain.handle(
    'files:download',
    async (_event, fileId: string, destPath?: string) =>
      ipcResult(async () => {
        let targetPath = destPath
        if (!targetPath) {
          const result = await dialogApi.showSaveDialog({
            title: 'Save File',
          })
          if (result.canceled || !result.filePath) {
            throw new Error('Download cancelled')
          }
          targetPath = result.filePath
        }

        const win = getMainWindow()
        await vfs.downloadFile(fileId, targetPath, (percent) => {
          win?.webContents.send('files:download:progress', {
            fileId,
            percent,
          })
        })
      })
  )

  ipcMain.handle(
    'files:delete',
    async (_event, fileId: string, permanent?: boolean) =>
      ipcResult(async () => {
        const result = await vfs.deleteFile(fileId, permanent)

        // If permanent delete, also delete from Telegram (best-effort)
        if (permanent && result && result.fileId && result.chunks.length > 0) {
          try {
            const { getClient } = await import('../../core/telegram/client')
            const { getChannelEntity } = await import('../../core/telegram/channels')
            const { withRetry, withEntityRetry } = await import('../../core/telegram/ratelimit')

            const tg = getClient()
            // Group chunks by channel_id
            const messageIdsByChannel = new Map<string, number[]>()
            for (const chunk of result.chunks) {
              const ids = messageIdsByChannel.get(chunk.channel_id) || []
              ids.push(chunk.message_id)
              messageIdsByChannel.set(chunk.channel_id, ids)
            }

            for (const [, messageIds] of messageIdsByChannel) {
              const entity = await getChannelEntity('storage')
              await withEntityRetry(() =>
                withRetry(() => tg.deleteMessages(entity, messageIds, { revoke: true }))
              )
            }
          } catch (err) {
            // DB cleanup already succeeded — log but don't throw
            console.error('[permanentDelete] Failed to delete from Telegram (non-fatal):', err)
          }
        }
      })
  )

  ipcMain.handle(
    'files:move',
    async (_event, fileId: string, newFolderPath: string) =>
      ipcResult(() => vfs.moveFileToFolder(fileId, newFolderPath))
  )

  ipcMain.handle(
    'files:rename',
    async (_event, fileId: string, newName: string) =>
      ipcResult(() => vfs.renameFile(fileId, newName))
  )

  ipcMain.handle('files:restore', async (_event, trashId: string) =>
    ipcResult(() => vfs.restoreFile(trashId))
  )

  ipcMain.handle('files:search', async (_event, query: string) =>
    ipcResult(() => vfs.searchFiles(query))
  )

  ipcMain.handle(
    'files:copyMultiple',
    async (_event, fileIds: string[], destPath: string) =>
      ipcResult(async () => {
        const { copyMultiple } = await import('../../core/telegram/copier')
        return copyMultiple(fileIds, destPath)
      })
  )

  ipcMain.handle('files:recent', async (_event, limit?: number) =>
    ipcResult(() => vfs.getRecentFiles(limit ?? 50))
  )

  ipcMain.handle('files:toggleStar', async (_event, id: string) =>
    ipcResult(async () => {
      const starred = await vfs.toggleStar(id)
      return { starred }
    })
  )

  ipcMain.handle('files:starred', async () =>
    ipcResult(() => vfs.getStarredFiles())
  )

  ipcMain.handle('files:shareLink', async (_event, fileId: string) =>
    ipcResult(async () => {
      const { getDb } = await import('../../core/db/db')
      const db = getDb()
      const chunks = db.prepare('SELECT * FROM chunks WHERE file_id = ? ORDER BY chunk_index ASC').all(fileId) as { message_id: number; channel_id: string }[]
      if (chunks.length === 0) throw new Error('File has no content chunks')
      const channelId = chunks[0].channel_id.replace(/^-100/, '')
      const messageId = chunks[0].message_id
      return { url: `https://t.me/c/${channelId}/${messageId}` }
    })
  )

  ipcMain.handle('files:versions', async (_event, fileId: string) =>
    ipcResult(() => getVersionsByFileId(fileId).map(mapVersion))
  )

  ipcMain.handle('files:restoreVersion', async (_event, versionId: string) =>
    ipcResult(async () => {
      const { restoreVersion } = await import('../../core/db/versions.db')
      return restoreVersion(versionId)
    })
  )

  ipcMain.handle('files:trash', async () =>
    ipcResult(() => getTrashedFiles())
  )

  // System: channel status & init (called from Drive page on mount)
  ipcMain.handle('system:getChannelStatus', async () =>
    ipcResult(() => channelsReady())
  )

  ipcMain.handle('system:initializeChannels', async () =>
    ipcResult(async () => {
      await initializeChannels()
      return { success: true }
    })
  )

  // Preview: download file to userData cache, return local path
  // Cached by fileId so repeated previews are instant
  ipcMain.handle('files:downloadToTemp', async (_event, fileId: string) =>
    ipcResult(async () => {
      const file = getFileById(fileId)
      if (!file) throw new Error(`File not found: ${fileId}`)

      const cacheDir = path.join(app.getPath('userData'), 'preview-cache')
      await fs.mkdir(cacheDir, { recursive: true })

      const ext = path.extname(file.name)
      const cachedPath = path.join(cacheDir, `${fileId}${ext}`)

      // Return cached version if it already exists
      try {
        await fs.access(cachedPath)
        return cachedPath
      } catch {
        // Not cached — download from Telegram
      }

      await downloadFile(fileId, cachedPath)
      return cachedPath
    })
  )

  // Preview: read a local file as Buffer (legacy — prefer tvfile:// URLs)
  ipcMain.handle('files:readLocalFile', async (_event, filePath: string) =>
    ipcResult(async () => {
      const buffer = await fs.readFile(filePath)
      return buffer
    })
  )

  ipcMain.handle('files:backfillThumbnails', async () =>
    ipcResult(async () => {
      // @ts-ignore
      const sharp = (await import('sharp')).default
      const allFiles = getAllFiles()
      const imagesWithoutThumbs = allFiles.filter(
        (f) => f.mime_type?.startsWith('image/') && !f.thumbnail_path
      )

      const thumbDir = path.join(app.getPath('userData'), 'thumbnails')
      const cacheDir = path.join(app.getPath('userData'), 'preview-cache')
      await fs.mkdir(thumbDir, { recursive: true })
      await fs.mkdir(cacheDir, { recursive: true })

      let processed = 0
      for (const file of imagesWithoutThumbs) {
        try {
          const ext = path.extname(file.name)
          const tempPath = path.join(cacheDir, `${file.id}-backfill${ext}`)
          await downloadFile(file.id, tempPath)

          const thumbPath = path.join(thumbDir, `${file.id}.jpg`)
          await sharp(tempPath)
            .resize(200, 200, { fit: 'cover' })
            .jpeg({ quality: 70 })
            .toFile(thumbPath)

          updateFileThumbnail(file.id, thumbPath)
          await fs.unlink(tempPath).catch(() => {})
          processed++
        } catch (err) {
          console.error(`[backfill] Failed for file ${file.id}:`, err)
        }
      }

      return { processed, total: imagesWithoutThumbs.length }
    })
  )
}

