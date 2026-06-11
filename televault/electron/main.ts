import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { config } from 'dotenv'
import { getDb } from '../core/db/db'
import { ensureRootFolder } from '../core/fs/vfs'
import { registerAuthIpc } from './ipc/auth.ipc'
import { registerFilesIpc } from './ipc/files.ipc'
import { registerFoldersIpc } from './ipc/folders.ipc'
import { registerSyncIpc } from './ipc/sync.ipc'
import { registerSettingsIpc } from './ipc/settings.ipc'
import { registerLicenseIpc } from './ipc/license.ipc'
import { initUpdater, installUpdate } from './updater'
import { ipcResult } from './ipc/helpers'

config()

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'TeleVault',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl && url.startsWith(devUrl)) {
      return
    }
    if (url.startsWith('file://')) {
      return
    }
    event.preventDefault()
    shell.openExternal(url)
  })

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173'
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  initUpdater(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerSystemIpc(): void {
  ipcMain.handle('system:openFilePicker', async () =>
    ipcResult(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled) {
        return []
      }
      return result.filePaths
    })
  )

  ipcMain.handle('system:openFolderPicker', async () =>
    ipcResult(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) {
        throw new Error('Folder selection cancelled')
      }
      return result.filePaths[0]
    })
  )

  ipcMain.handle('system:openInExplorer', async (_event, filePath: string) =>
    ipcResult(async () => {
      shell.showItemInFolder(filePath)
    })
  )

  ipcMain.handle('system:getAppVersion', async () =>
    ipcResult(() => app.getVersion())
  )

  ipcMain.handle('updater:install', async () =>
    ipcResult(async () => {
      installUpdate()
    })
  )
}

function registerAllIpc(): void {
  registerAuthIpc(ipcMain)
  registerFilesIpc(ipcMain, getMainWindow, dialog)
  registerFoldersIpc(ipcMain)
  registerSyncIpc(ipcMain)
  registerSettingsIpc(ipcMain)
  registerLicenseIpc(ipcMain)
  registerSystemIpc()
}

app.whenReady().then(() => {
  getDb()
  ensureRootFolder()
  registerAllIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
