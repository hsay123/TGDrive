import type { IpcMain } from 'electron'
import {
  getSetting,
  setSetting,
  getAllSettings,
} from '../../core/db/settings.db'
import { getKeyFingerprint } from '../../core/crypto/keystore'
import { refreshAutoSync } from './sync.ipc'
import { ipcResult } from './helpers'

export function registerSettingsIpc(ipcMain: IpcMain): void {
  ipcMain.handle('settings:get', async (_event, key: string) =>
    ipcResult(() => getSetting(key))
  )

  ipcMain.handle('settings:set', async (_event, key: string, value: string) =>
    ipcResult(async () => {
      setSetting(key, value)
      if (key === 'auto_sync_interval') {
        refreshAutoSync()
      }
    })
  )

  ipcMain.handle('settings:getAll', async () =>
    ipcResult(() => getAllSettings())
  )

  ipcMain.handle('settings:getKeyFingerprint', async () =>
    ipcResult(() => getKeyFingerprint())
  )
}
