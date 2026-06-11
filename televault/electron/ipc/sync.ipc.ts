import type { IpcMain } from 'electron'
import { pushIndex } from '../../core/sync/pusher'
import { pullIndex, getSyncStatus } from '../../core/sync/puller'
import { getSetting } from '../../core/db/settings.db'
import { ipcResult } from './helpers'

let autoSyncInterval: ReturnType<typeof setInterval> | null = null

function clearAutoSync(): void {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval)
    autoSyncInterval = null
  }
}

function setupAutoSync(): void {
  clearAutoSync()
  const intervalStr = getSetting('auto_sync_interval') ?? '0'
  const intervalMs = parseInt(intervalStr, 10)

  if (!intervalMs || intervalMs <= 0) {
    return
  }

  autoSyncInterval = setInterval(async () => {
    try {
      await pushIndex()
      await pullIndex()
    } catch (error) {
      console.error('[sync] auto-sync error:', error)
    }
  }, intervalMs)
}

export function registerSyncIpc(ipcMain: IpcMain): void {
  setupAutoSync()

  ipcMain.handle('sync:push', async () =>
    ipcResult(() => pushIndex())
  )

  ipcMain.handle('sync:pull', async () =>
    ipcResult(async () => {
      await pullIndex()
    })
  )

  ipcMain.handle('sync:status', async () =>
    ipcResult(() => getSyncStatus())
  )

  ipcMain.handle('sync:refreshAutoSync', async () => {
    setupAutoSync()
    return { success: true }
  })
}

export function refreshAutoSync(): void {
  setupAutoSync()
}
