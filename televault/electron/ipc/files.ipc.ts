import { app } from 'electron'
import type { BrowserWindow, IpcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import * as vfs from '../../core/fs/vfs'
import { getVersionsByFileId } from '../../core/db/versions.db'
import { getTrashedFiles } from '../../core/db/trash.db'
import { getFileById } from '../../core/db/files.db'
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
        // Ensure channels exist before attempting upload (self-healing)
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
      ipcResult(() => vfs.deleteFile(fileId, permanent))
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

  ipcMain.handle('files:versions', async (_event, fileId: string) =>
    ipcResult(() => getVersionsByFileId(fileId).map(mapVersion))
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

  // Preview: read a local file as Buffer (renderer converts to Blob URL)
  ipcMain.handle('files:readLocalFile', async (_event, filePath: string) =>
    ipcResult(async () => {
      const buffer = await fs.readFile(filePath)
      return buffer
    })
  )
}

