import { app, dialog } from 'electron'
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { getDb } from '../core/db/db'
import {
  runLegacySessionMigration,
  type MigrationNotice,
} from '../core/db/legacy-session-migration'
import {
  getCredentialStorageStatus,
  writeProtected,
} from '../core/crypto/protected-store'

const REVOKE_TIMEOUT_MS = 12_000

/**
 * Revoke the rc.1 session on Telegram's servers using the legacy plaintext
 * values. A fresh client is created because the migration runs before any
 * normal client is initialised. Offline launches must not block startup, so
 * the attempt is time-boxed.
 */
async function revokeSession(
  apiId: number,
  apiHash: string,
  session: string
): Promise<void> {
  const client = new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    { connectionRetries: 1 }
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Telegram session revocation timed out')),
      REVOKE_TIMEOUT_MS
    )
  })

  try {
    await Promise.race([
      (async () => {
        await client.connect()
        await client.invoke(new Api.auth.LogOut())
      })(),
      timeout,
    ])
  } finally {
    if (timer) clearTimeout(timer)
    try {
      await client.disconnect()
    } catch {
      // The revocation result is what matters; a failed disconnect must not
      // turn a successful logout into an "offline" warning.
    }
  }
}

export async function runStartupSecurityMigration(): Promise<void> {
  try {
    await runLegacySessionMigration({
      getDb,
      userDataPath: () => app.getPath('userData'),
      revokeSession,
      saveProtected: (key, value) => {
        writeProtected(key, value)
      },
      protectedStorePersisted: () => getCredentialStorageStatus().persisted,
      notify: (notice: MigrationNotice) => {
        void dialog.showMessageBox({
          type: notice.kind === 'offline-revocation-needed' ? 'warning' : 'info',
          title: notice.title,
          message: notice.title,
          detail: notice.message,
          buttons: ['OK'],
        })
      },
      log: (message) => console.log(message),
    })
  } catch (error) {
    // Never block app startup on the one-time cleanup. The marker is written
    // last, so the next launch retries automatically.
    console.error(
      '[security-migration] failed; will retry next launch:',
      error instanceof Error ? error.message : String(error)
    )
  }
}
