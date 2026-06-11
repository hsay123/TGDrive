import type { IpcMain } from 'electron'
import * as vfs from '../../core/fs/vfs'
import { ipcResult } from './helpers'

export function registerFoldersIpc(ipcMain: IpcMain): void {
  ipcMain.handle('folders:create', async (_event, folderPath: string) =>
    ipcResult(() => vfs.createFolderAtPath(folderPath))
  )

  ipcMain.handle('folders:delete', async (_event, folderId: string) =>
    ipcResult(() => vfs.deleteFolderById(folderId))
  )

  ipcMain.handle(
    'folders:rename',
    async (_event, folderId: string, newName: string) =>
      ipcResult(async () => {
        await vfs.renameFolder(folderId, newName)
      })
  )

  ipcMain.handle(
    'folders:move',
    async (_event, folderId: string, newParentPath: string) =>
      ipcResult(async () => {
        await vfs.moveFolder(folderId, newParentPath)
      })
  )

  ipcMain.handle('folders:tree', async () =>
    ipcResult(() => vfs.getTree())
  )
}
