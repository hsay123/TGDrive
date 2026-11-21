import type { IpcMain } from 'electron'
import {
  getSetting,
  setSetting,
  getAllSettings,
} from '../../core/db/settings.db'
import { getKeyFingerprint } from '../../core/crypto/keystore'
import { checkEncryptionReadiness } from '../../core/crypto/key-guard'
import { refreshAutoSync } from './sync.ipc'
import { ipcResult } from './helpers'

/** Credentials are never readable or writable through the generic settings bridge. */
const RENDERER_BLOCKED_KEYS = new Set([
  'telegram_session',
  'telegram_api_id',
  'telegram_api_hash',
])

function assertRendererSafeKey(key: string): void {
  if (RENDERER_BLOCKED_KEYS.has(key)) {
    throw new Error('This setting is managed by the protected credential store')
  }
}

export function registerSettingsIpc(ipcMain: IpcMain): void {
  ipcMain.handle('settings:get', async (_event, key: string) =>
    ipcResult(() => {
      assertRendererSafeKey(key)
      return getSetting(key)
    })
  )

  ipcMain.handle('settings:set', async (_event, key: string, value: string) =>
    ipcResult(async () => {
      assertRendererSafeKey(key)
      setSetting(key, value)
      if (key === 'auto_sync_interval') {
        refreshAutoSync()
      }
    })
  )

  ipcMain.handle('settings:getAll', async () =>
    ipcResult(() => {
      const all = getAllSettings()
      for (const key of RENDERER_BLOCKED_KEYS) delete all[key]
      return all
    })
  )

  ipcMain.handle('settings:getKeyFingerprint', async () =>
    ipcResult(() => getKeyFingerprint())
  )

  ipcMain.handle('settings:encryptionStatus', async () =>
    ipcResult(() => checkEncryptionReadiness())
  )
}
