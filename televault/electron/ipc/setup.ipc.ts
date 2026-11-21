import type { IpcMain } from 'electron'
import { ipcResult } from './helpers'
import { shell } from 'electron'
import {
  getCredentialStorageStatus,
  hasProtected,
  writeProtected,
} from '../../core/crypto/protected-store'

export function registerSetupIpc(ipcMain: IpcMain): void {
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

      // Save FIRST, into OS-encrypted storage — never plaintext settings rows.
      const trimId = apiId.trim()
      const trimHash = apiHash.trim()
      const idPersisted = writeProtected('telegram_api_id', trimId)
      const hashPersisted = writeProtected('telegram_api_hash', trimHash)
      // never log credential values — not even the numeric API ID
      console.log('[setup] Saved credentials — persisted:', idPersisted && hashPersisted)

      // Reinit client — non-fatal, login page will handle client init
      try {
        const { reinitClient } = await import('../../core/telegram/client')
        await reinitClient()
        console.log('[setup] Client reinitialized')
      } catch (err) {
        console.warn('[setup] reinitClient failed (non-fatal):', err)
      }
    })
  )

  ipcMain.handle('system:hasApiCredentials', async () =>
    ipcResult(() => hasProtected('telegram_api_id', 'telegram_api_hash'))
  )

  ipcMain.handle('system:credentialStorageStatus', async () =>
    ipcResult(() => getCredentialStorageStatus())
  )
}
