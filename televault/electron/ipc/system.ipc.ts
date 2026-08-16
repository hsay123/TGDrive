import { ipcMain, app } from 'electron'
import path from 'path'
import { getSetting } from '../../core/telegram/client'
import { ipcResult } from './helpers'
import fs from 'fs/promises'

export function registerSystemAvatarIpc() {
  // Get current cached avatar path → returns tvfile:// URL or null
  ipcMain.handle(
    'system:getAvatarUrl',
    () =>
      ipcResult(async () => {
        const avatarPath = getSetting('avatar_path')
        if (!avatarPath) return null

        // Convert absolute path to tvfile:// URL using existing protocol
        // tvfile://avatars/<filename> maps to <userData>/avatars/<filename>
        const filename = path.basename(avatarPath)
        return `tvfile://avatars/${filename}`
      })
  )

  // Synchronous last-known-good session seed. The renderer reads this at
  // auth.store module load so a reload on ANY route (not just "/") restores the
  // signed-in user + avatar before the first paint — no "User"/"?" defaults
  // flash while hydrateSession() revalidates against Telegram.
  ipcMain.on('system:getPersistedUser', (event) => {
    try {
      const rawUser = getSetting('last_user')
      const avatarPath = getSetting('avatar_path')

      let user: unknown = null
      if (rawUser) {
        try {
          user = JSON.parse(rawUser)
        } catch {
          user = null
        }
      }

      if (!user) {
        event.returnValue = { success: true, data: null }
        return
      }

      const avatarUrl = avatarPath
        ? `tvfile://avatars/${path.basename(avatarPath)}`
        : null
      event.returnValue = { success: true, data: { user, avatarUrl } }
    } catch (err) {
      event.returnValue = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // Force re-fetch avatar (e.g. user changed their Telegram photo).
  // Crash-safe: the new photo is downloaded to a temp file first, and the
  // old cached file / avatar_path setting are only replaced once the new
  // photo is confirmed written. Any failure leaves the previous avatar intact
  // and is surfaced as an error to the renderer.
  ipcMain.handle(
    'system:refreshAvatar',
    () =>
      ipcResult(async () => {
        const { getCurrentUser, downloadAvatarToTemp } = await import('../../core/telegram/auth')
        const { setSetting } = await import('../../core/telegram/client')

        const user = await getCurrentUser()
        if (!user) {
          throw new Error('Not signed in')
        }

        const avatarDir = path.join(app.getPath('userData'), 'avatars')
        await fs.mkdir(avatarDir, { recursive: true })
        const avatarPath = path.join(avatarDir, `${user.id}.jpg`)

        // 1. Download the new photo to a temp file. The existing cached avatar
        //    and avatar_path setting are left untouched until this succeeds.
        const tempPath = await downloadAvatarToTemp(user.id.toString())
        if (!tempPath) {
          throw new Error('Could not download profile photo')
        }

        // 2. New photo confirmed written — atomically replace the old cache.
        await fs.rename(tempPath, avatarPath)
        setSetting('avatar_path', avatarPath)

        const filename = path.basename(avatarPath)
        return `tvfile://avatars/${filename}`
      })
  )
}
