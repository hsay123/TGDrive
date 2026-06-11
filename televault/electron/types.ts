import type { TGUser } from '../core/telegram/client'
import type { VFSFile, VFSFolder, VFSEntry } from '../core/fs/vfs'
import type { SyncStatus } from '../core/sync/puller'
import type { LicenseInfo } from './ipc/license.ipc'
import type { VersionRow } from './ipc/files.ipc'
import type { TrashRow } from '../core/db/trash.db'
import type { IpcResult } from './ipc/helpers'

export type { TGUser, VFSFile, VFSFolder, VFSEntry, SyncStatus, LicenseInfo, VersionRow, TrashRow, IpcResult }

export interface TeleVaultAPI {
  auth: {
    sendCode: (
      phone: string,
      forceSMS?: boolean
    ) => Promise<IpcResult<{ phoneCodeHash: string; isCodeViaApp: boolean }>>
    resendCode: (
      phone: string,
      phoneCodeHash: string,
      forceSMS?: boolean
    ) => Promise<IpcResult<{ phoneCodeHash: string; isCodeViaApp: boolean }>>
    signIn: (
      phone: string,
      phoneCodeHash: string,
      code: string
    ) => Promise<IpcResult<{ user: TGUser }>>
    check2FA: (password: string) => Promise<IpcResult<{ user: TGUser }>>
    logout: () => Promise<IpcResult<void>>
    getSession: () => Promise<
      IpcResult<{ isLoggedIn: boolean; user: TGUser | null }>
    >
  }
  files: {
    list: (folderPath: string) => Promise<IpcResult<VFSEntry[]>>
    upload: (
      localPath: string,
      destFolderPath: string,
      encrypt: boolean
    ) => Promise<IpcResult<VFSFile>>
    download: (fileId: string, destPath?: string) => Promise<IpcResult<void>>
    delete: (fileId: string, permanent?: boolean) => Promise<IpcResult<void>>
    move: (fileId: string, newFolderPath: string) => Promise<IpcResult<void>>
    rename: (fileId: string, newName: string) => Promise<IpcResult<void>>
    restore: (trashId: string) => Promise<IpcResult<void>>
    search: (query: string) => Promise<IpcResult<VFSFile[]>>
    getVersions: (fileId: string) => Promise<IpcResult<VersionRow[]>>
    getTrash: () => Promise<IpcResult<TrashRow[]>>
    downloadToTemp: (fileId: string) => Promise<IpcResult<string>>
    readLocalFile: (filePath: string) => Promise<IpcResult<Uint8Array>>
    backfillThumbnails: () => Promise<IpcResult<{ processed: number; total: number }>>
    onUploadProgress: (
      callback: (data: { localPath: string; percent: number }) => void
    ) => () => void
    onDownloadProgress: (
      callback: (data: { fileId: string; percent: number }) => void
    ) => () => void
  }
  folders: {
    create: (path: string) => Promise<IpcResult<VFSFolder>>
    delete: (folderId: string) => Promise<IpcResult<void>>
    rename: (folderId: string, newName: string) => Promise<IpcResult<void>>
    move: (folderId: string, newParentPath: string) => Promise<IpcResult<void>>
    getTree: () => Promise<IpcResult<VFSFolder>>
  }
  sync: {
    push: () => Promise<IpcResult<{ messageId: number }>>
    pull: () => Promise<IpcResult<void>>
    getStatus: () => Promise<IpcResult<SyncStatus>>
  }
  settings: {
    get: (key: string) => Promise<IpcResult<string | null>>
    set: (key: string, value: string) => Promise<IpcResult<void>>
    getAll: () => Promise<IpcResult<Record<string, string>>>
    getKeyFingerprint: () => Promise<IpcResult<string>>
  }
  license: {
    validate: (key: string) => Promise<IpcResult<LicenseInfo>>
    getTier: () => Promise<IpcResult<'free' | 'pro' | 'team'>>
  }
  system: {
    openFilePicker: () => Promise<IpcResult<string[]>>
    openFolderPicker: () => Promise<IpcResult<string>>
    openInExplorer: (filePath: string) => Promise<IpcResult<void>>
    getAppVersion: () => Promise<IpcResult<string>>
    getChannelStatus: () => Promise<IpcResult<{ ready: boolean; missing: string[] }>>
    initializeChannels: () => Promise<IpcResult<{ success: boolean }>>
  }
  updater: {
    install: () => Promise<IpcResult<void>>
    onAvailable: (callback: () => void) => () => void
    onProgress: (callback: (percent: number) => void) => () => void
    onReady: (callback: () => void) => () => void
  }
}
