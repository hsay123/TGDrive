import type { IpcMain } from 'electron'
import * as auth from '../../core/telegram/auth'
import { ipcResult } from './helpers'

export function registerAuthIpc(ipcMain: IpcMain): void {
  ipcMain.handle('auth:sendCode', async (_event, phone: string, forceSMS?: boolean) =>
    ipcResult(async () => {
      const result = await auth.sendCode(phone, forceSMS ?? false)
      return result
    })
  )

  ipcMain.handle(
    'auth:resendCode',
    async (_event, phone: string, phoneCodeHash: string, forceSMS?: boolean) =>
      ipcResult(async () => {
        const result = await auth.resendCode(phone, phoneCodeHash, forceSMS ?? false)
        return result
      })
  )

  ipcMain.handle(
    'auth:signIn',
    async (
      _event,
      phone: string,
      phoneCodeHash: string,
      code: string
    ) => {
      return ipcResult(async () => {
        const result = await auth.signIn(phone, phoneCodeHash, code)
        if (result.status === 'needs_2fa') {
          throw new Error('2FA required')
        }
        if (!result.user) {
          throw new Error('Sign in failed')
        }
        return { user: result.user }
      })
    }
  )

  ipcMain.handle('auth:check2FA', async (_event, password: string) =>
    ipcResult(async () => {
      const result = await auth.complete2FA(password)
      return { user: result.user }
    })
  )

  ipcMain.handle('auth:logout', async () =>
    ipcResult(async () => {
      await auth.signOut()
    })
  )

  ipcMain.handle('auth:getSession', async () =>
    ipcResult(async () => {
      const user = await auth.getCurrentUser()
      return {
        isLoggedIn: user !== null,
        user,
      }
    })
  )
}
