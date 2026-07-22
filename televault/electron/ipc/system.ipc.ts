import { ipcMain, app } from 'electron'
import path from 'path'
import { getSetting } from '../../core/telegram/client'
import { fetchAndCacheAvatar } from '../../core/telegram/auth'
import fs from 'fs/promises'

export function registerSystemAvatarIpc() {
  // Get current cached avatar path → returns tvfile:// URL or null
  ipcMain.handle('system:getAvatarUrl', async () => {
  const avatarPath = getSetting('avatar_path')
  if (!avatarPath) return null

  // Convert absolute path to tvfile:// URL using existing protocol
  // tvfile://avatars/<filename> maps to <userData>/avatars/<filename>
  const filename = path.basename(avatarPath)
  return `tvfile://avatars/${filename}`
})

// Force re-fetch avatar (e.g. user changed their Telegram photo)
ipcMain.handle('system:refreshAvatar', async () => {
  const { getCurrentUser } = await import('../../core/telegram/auth')
  const user = await getCurrentUser()
  if (!user) return null

  // Delete cached file to force re-download
  const avatarPath = path.join(app.getPath('userData'), 'avatars', `${user.id}.jpg`)
  await fs.unlink(avatarPath).catch(() => {})

  const newPath = await fetchAndCacheAvatar(user.id.toString())
  if (!newPath) return null

    const filename = path.basename(newPath)
    return `tvfile://avatars/${filename}`
  })
}
