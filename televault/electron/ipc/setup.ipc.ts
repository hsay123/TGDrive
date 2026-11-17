import type { IpcMain } from 'electron'
import { ipcResult } from './helpers'
import { getSetting, setSetting } from '../../core/db/settings.db'
import { shell } from 'electron'

export function registerLicenseIpc(ipcMain: IpcMain): void {
  ipcMain.handle('system:openExternal', async (_event, url: string) =>
    ipcResult(async () => {
      await shell.openExternal(url)
    })
  )

  ipcMain.handle('system:saveApiCredentials', async (_event, apiId: string, apiHash: string) =>
    ipcResult(async () => {
      if (!apiId?.trim() || !apiHash?.trim()) {
        throw new Error('Both API ID and Hash are required')
      }

      // 1. Save FIRST — always, before anything else
      const trimId = apiId.trim()
      const trimHash = apiHash.trim()
      setSetting('telegram_api_id', trimId)
      setSetting('telegram_api_hash', trimHash)
      console.log('[setup] Saved credentials — apiId:', trimId, '| hash length:', trimHash.length)
      console.log('[setup] Verify read-back:', getSetting('telegram_api_id'))

      // 2. Reinit client — non-fatal, login page will handle client init
      try {
        const { reinitClient } = await import('../../core/telegram/client')
        await reinitClient()
        console.log('[setup] Client reinitialized')
      } catch (err) {
        console.warn('[setup] reinitClient failed (non-fatal):', err)
        // Don't throw — credentials are saved, sendCode will lazily init the client
      }
    })
  )

  ipcMain.handle('system:hasApiCredentials', async () =>
    ipcResult(() => {
      const apiId = getSetting('telegram_api_id')
      const apiHash = getSetting('telegram_api_hash')
      const has = !!(apiId && apiHash)
      console.log('[setup] hasApiCredentials check:', has, '(apiId:', apiId, ')')
      return has
    })
  )
}
