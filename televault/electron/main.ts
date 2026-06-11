import { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, session } from 'electron'
import path from 'path'
import { pathToFileURL } from 'url'
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tvfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

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

function isPathInsideDir(baseDir: string, targetPath: string): boolean {
  const base = path.resolve(baseDir) + path.sep
  const resolved = path.resolve(targetPath)
  return resolved.startsWith(base)
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  const allowedDirs = [
    path.join(userDataPath, 'thumbnails'),
    path.join(userDataPath, 'preview-cache'),
  ]

  protocol.handle('tvfile', (request) => {
    const url = new URL(request.url)
    const category = url.hostname
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '')

    const baseDir = path.join(userDataPath, category)
    if (!allowedDirs.includes(baseDir)) {
      return new Response('Forbidden', { status: 403 })
    }

    const resolvedPath = path.normalize(path.join(baseDir, relativePath))
    if (!isPathInsideDir(baseDir, resolvedPath)) {
      return new Response('Forbidden', { status: 403 })
    }

    return net.fetch(pathToFileURL(resolvedPath).toString())
  })

  const csp = isDev
    ? // DEV: permissive — allows Vite HMR, inline scripts, eval (needed for Fast Refresh)
      "default-src 'self' http://localhost:5173 ws://localhost:5173; " +
      "img-src 'self' data: blob: tvfile: http://localhost:5173; " +
      "media-src 'self' tvfile:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; " +
      "frame-src 'self' tvfile:; " +
      "connect-src 'self' http://localhost:5173 ws://localhost:5173"
    : // PRODUCTION: strict — no unsafe-inline/eval needed since Vite build has no HMR
      "default-src 'self'; " +
      "img-src 'self' data: blob: tvfile:; " +
      "media-src 'self' tvfile:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "script-src 'self'; " +
      "frame-src 'self' tvfile:; " +
      "connect-src 'self'"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['Content-Security-Policy']
    delete responseHeaders['content-security-policy']
    responseHeaders['Content-Security-Policy'] = [csp]
    callback({ responseHeaders })
  })

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
