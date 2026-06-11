import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain, dialog } from 'electron'
import log from 'electron-log'

// Configure logging
autoUpdater.logger = log
autoUpdater.autoDownload = false    // don't auto-download — ask user first
autoUpdater.autoInstallOnAppQuit = true

export function initUpdater(mainWindow: BrowserWindow): void {
  // Check for updates 5 seconds after launch (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log.error('Update check failed:', err)
    })
  }, 5000)

  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    mainWindow.webContents.send('update:status', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes,
    })
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update:status', { status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update:status', { status: 'downloaded' })
    // Show native dialog asking to restart
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'A new version of TeleVault is ready.',
      detail: 'Restart now to install the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
    mainWindow.webContents.send('update:status', { status: 'error', message: err.message })
  })

  // IPC: renderer requests manual check
  ipcMain.on('update:check', () => {
    autoUpdater.checkForUpdates().catch(err => log.error('Manual update check failed:', err))
  })

  // IPC: renderer requests download after seeing 'available' status
  ipcMain.on('update:download', () => {
    autoUpdater.downloadUpdate().catch(err => log.error('Update download failed:', err))
  })
}

// Called by updater:install IPC handler in main.ts
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}

// Alias for compatibility
export { initUpdater as initAutoUpdater }
