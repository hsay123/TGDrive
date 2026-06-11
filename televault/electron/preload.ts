import { contextBridge, ipcRenderer } from 'electron'
import type { TeleVaultAPI } from './types'

const televault: TeleVaultAPI = {
  auth: {
    sendCode: (phone, forceSMS) =>
      ipcRenderer.invoke('auth:sendCode', phone, forceSMS),
    resendCode: (phone, phoneCodeHash, forceSMS) =>
      ipcRenderer.invoke('auth:resendCode', phone, phoneCodeHash, forceSMS),
    signIn: (phone, phoneCodeHash, code) =>
      ipcRenderer.invoke('auth:signIn', phone, phoneCodeHash, code),
    check2FA: (password) => ipcRenderer.invoke('auth:check2FA', password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
  },
  files: {
    list: (folderPath) => ipcRenderer.invoke('files:list', folderPath),
    upload: (localPath, destFolderPath, encrypt) =>
      ipcRenderer.invoke('files:upload', localPath, destFolderPath, encrypt),
    download: (fileId, destPath) =>
      ipcRenderer.invoke('files:download', fileId, destPath),
    delete: (fileId, permanent) =>
      ipcRenderer.invoke('files:delete', fileId, permanent),
    move: (fileId, newFolderPath) =>
      ipcRenderer.invoke('files:move', fileId, newFolderPath),
    rename: (fileId, newName) =>
      ipcRenderer.invoke('files:rename', fileId, newName),
    restore: (trashId) => ipcRenderer.invoke('files:restore', trashId),
    search: (query) => ipcRenderer.invoke('files:search', query),
    getVersions: (fileId) => ipcRenderer.invoke('files:versions', fileId),
    getTrash: () => ipcRenderer.invoke('files:trash'),
    downloadToTemp: (fileId) => ipcRenderer.invoke('files:downloadToTemp', fileId),
    readLocalFile: (filePath) => ipcRenderer.invoke('files:readLocalFile', filePath),
    backfillThumbnails: () => ipcRenderer.invoke('files:backfillThumbnails'),
    onUploadProgress: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { localPath: string; percent: number }
      ) => callback(data)
      ipcRenderer.on('files:upload:progress', handler)
      return () => ipcRenderer.removeListener('files:upload:progress', handler)
    },
    onDownloadProgress: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { fileId: string; percent: number }
      ) => callback(data)
      ipcRenderer.on('files:download:progress', handler)
      return () =>
        ipcRenderer.removeListener('files:download:progress', handler)
    },
  },
  folders: {
    create: (path) => ipcRenderer.invoke('folders:create', path),
    delete: (folderId) => ipcRenderer.invoke('folders:delete', folderId),
    rename: (folderId, newName) =>
      ipcRenderer.invoke('folders:rename', folderId, newName),
    move: (folderId, newParentPath) =>
      ipcRenderer.invoke('folders:move', folderId, newParentPath),
    getTree: () => ipcRenderer.invoke('folders:tree'),
  },
  sync: {
    push: () => ipcRenderer.invoke('sync:push'),
    pull: () => ipcRenderer.invoke('sync:pull'),
    getStatus: () => ipcRenderer.invoke('sync:status'),
  },
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    getKeyFingerprint: () => ipcRenderer.invoke('settings:getKeyFingerprint'),
  },
  license: {
    validate: (key) => ipcRenderer.invoke('license:validate', key),
    getTier: () => ipcRenderer.invoke('license:getTier'),
  },
  system: {
    openFilePicker: () => ipcRenderer.invoke('system:openFilePicker'),
    openFolderPicker: () => ipcRenderer.invoke('system:openFolderPicker'),
    openInExplorer: (filePath) =>
      ipcRenderer.invoke('system:openInExplorer', filePath),
    getAppVersion: () => ipcRenderer.invoke('system:getAppVersion'),
    getChannelStatus: () => ipcRenderer.invoke('system:getChannelStatus'),
    initializeChannels: () => ipcRenderer.invoke('system:initializeChannels'),
  },
  updater: {
    install: () => ipcRenderer.invoke('updater:install'),
    onAvailable: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('updater:available', handler)
      return () => ipcRenderer.removeListener('updater:available', handler)
    },
    onProgress: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, percent: number) =>
        callback(percent)
      ipcRenderer.on('updater:progress', handler)
      return () => ipcRenderer.removeListener('updater:progress', handler)
    },
    onReady: (callback) => {
      const handler = () => callback()
      ipcRenderer.on('updater:ready', handler)
      return () => ipcRenderer.removeListener('updater:ready', handler)
    },
  },
}

contextBridge.exposeInMainWorld('televault', televault)
