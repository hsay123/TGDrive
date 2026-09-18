import type { IpcMain } from 'electron'
import * as vfs from '../../core/fs/vfs'
import { ipcResult } from './helpers'

type TreeData = Awaited<ReturnType<typeof vfs.getTree>>

// The folder tree is rebuilt via a recursive DB walk on every request. It only
// needs to be fresh when a folder was mutated, so cache it briefly and
// invalidate explicitly on every mutating handler. Prevents an expensive
// rebuild on every folder navigation.
let treeCache: { data: TreeData; timestamp: number } | null = null
const TREE_CACHE_TTL_MS = 10_000

function invalidateTreeCache(): void {
  treeCache = null
}

export function registerFoldersIpc(ipcMain: IpcMain): void {
  ipcMain.handle('folders:create', async (_event, folderPath: string) =>
    ipcResult(async () => {
      const folder = await vfs.createFolderAtPath(folderPath)
      invalidateTreeCache()
      return folder
    })
  )

  ipcMain.handle('folders:delete', async (_event, folderId: string) =>
    ipcResult(async () => {
      await vfs.deleteFolderById(folderId)
      invalidateTreeCache()
    })
  )

  ipcMain.handle(
    'folders:rename',
    async (_event, folderId: string, newName: string) =>
      ipcResult(async () => {
        await vfs.renameFolder(folderId, newName)
        invalidateTreeCache()
      })
  )

  ipcMain.handle(
    'folders:move',
    async (_event, folderId: string, newParentPath: string) =>
      ipcResult(async () => {
        await vfs.moveFolder(folderId, newParentPath)
        invalidateTreeCache()
      })
  )

  ipcMain.handle('folders:tree', async () =>
    ipcResult(async () => {
      const now = Date.now()
      if (treeCache && now - treeCache.timestamp < TREE_CACHE_TTL_MS) {
        return treeCache.data
      }
      const data = await vfs.getTree()
      treeCache = { data, timestamp: now }
      return data
    })
  )

  ipcMain.handle('folders:toggleHidden', async (_event, folderId: string) =>
    ipcResult(async () => {
      const hidden = await vfs.toggleFolderHidden(folderId)
      invalidateTreeCache()
      return { hidden }
    })
  )
}
