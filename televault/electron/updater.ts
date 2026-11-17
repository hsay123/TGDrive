import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import { ipcResult } from './ipc/helpers'

// Configure logging
autoUpdater.logger = log
autoUpdater.autoDownload = false // don't auto-download — ask user first
autoUpdater.autoInstallOnAppQuit = true

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  version?: string
  releaseNotes?: string
  percent?: number
  message?: string
}

/**
 * Per-window event wiring. Safe to call again for each new window.
 * `mainWindow` is captured per call, so a reopened window gets its own events.
 */
export function initUpdater(mainWindow: BrowserWindow): void {
  const send = (payload: UpdateStatus): void => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('update:status', payload)
  }

  // Check for updates shortly after launch (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      // No published release yet is the normal case on a fresh install.
      log.warn('Update check failed:', err?.message ?? err)
    })
  }, 5000)

  autoUpdater.on('checking-for-update', () => {
    send({ phase: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send({
      phase: 'available',
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    })
  })

  autoUpdater.on('update-not-available', () => {
    send({ phase: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    send({ phase: 'downloading', percent: Math.round(progress.percent) })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    // The renderer owns the "restart to update" affordance (StatusBar), so no
    // native dialog here — otherwise the user gets prompted twice.
    send({ phase: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
    send({ phase: 'error', message: err?.message ?? String(err) })
  })
}

/**
 * Registers the renderer's updater request channels.
 *
 * MUST be called exactly once per process — `ipcMain.handle` throws on a
 * duplicate channel, and createWindow() runs again on macOS 'activate'.
 */
export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:check', () =>
    ipcResult(async () => {
      await autoUpdater.checkForUpdates()
    })
  )

  ipcMain.handle('updater:download', () =>
    ipcResult(async () => {
      // Throws if nothing is available yet — surfaced to the renderer as an error.
      await autoUpdater.downloadUpdate()
    })
  )
}

// Called by the updater:install IPC handler in main.ts
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}

// Alias for compatibility
export { initUpdater as initAutoUpdater }
