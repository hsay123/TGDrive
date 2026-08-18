import type { IpcMain } from 'electron'
import { ipcResult } from './helpers'
import {
  setRevealPin,
  verifyRevealPin,
  hasRevealPin,
  deleteRevealPin,
} from '../../core/crypto/reveal-pin'
import {
  isRevealGateUnlocked,
  setRevealGateUnlocked,
} from '../../core/reveal-gate'

export function registerRevealIpc(ipcMain: IpcMain): void {
  ipcMain.handle('reveal:hasPin', async () =>
    ipcResult(() => hasRevealPin())
  )

  ipcMain.handle('reveal:setPin', async (_event, pin: string) =>
    ipcResult(async () => {
      await setRevealPin(pin)
      setRevealGateUnlocked(true)
    })
  )

  ipcMain.handle('reveal:verify', async (_event, pin: string) =>
    ipcResult(async () => {
      const ok = await verifyRevealPin(pin)
      if (ok) setRevealGateUnlocked(true)
      return { ok }
    })
  )

  ipcMain.handle('reveal:deletePin', async () =>
    ipcResult(async () => {
      await deleteRevealPin()
      setRevealGateUnlocked(false)
    })
  )

  ipcMain.handle('reveal:isUnlocked', async () =>
    ipcResult(() => isRevealGateUnlocked())
  )

  ipcMain.handle('reveal:lock', async () =>
    ipcResult(() => {
      setRevealGateUnlocked(false)
    })
  )
}
