import type { IpcMain } from 'electron'
import os from 'os'
import crypto from 'crypto'
import { getSetting, setSetting } from '../../core/db/settings.db'
import { ipcResult } from './helpers'

export interface LicenseInfo {
  valid: boolean
  tier: 'free' | 'pro' | 'team'
  email?: string
  expiresAt?: number
}

type Tier = 'free' | 'pro' | 'team'

function getMachineId(): string {
  const raw = `${os.hostname()}-${os.userInfo().username}-${os.platform()}`
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function getLicenseServerUrl(): string {
  return (
    process.env.VITE_LICENSE_SERVER_URL ??
    process.env.LICENSE_SERVER_URL ??
    'https://api.televault.app'
  )
}

async function validateWithServer(key: string): Promise<LicenseInfo> {
  const response = await fetch(`${getLicenseServerUrl()}/validate-license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      machineId: getMachineId(),
    }),
  })

  if (!response.ok) {
    throw new Error(`License server error: ${response.status}`)
  }

  const data = (await response.json()) as {
    valid: boolean
    tier: Tier
    email?: string
    expiresAt?: number
  }

  return {
    valid: data.valid,
    tier: data.tier ?? 'free',
    email: data.email,
    expiresAt: data.expiresAt,
  }
}

function isCacheValid(): boolean {
  const cachedAt = getSetting('license_validated_at')
  if (!cachedAt) {
    return false
  }
  const age = Date.now() - parseInt(cachedAt, 10)
  return age < 24 * 60 * 60 * 1000
}

export function registerLicenseIpc(ipcMain: IpcMain): void {
  ipcMain.handle('license:validate', async (_event, key: string) =>
    ipcResult(async () => {
      const info = await validateWithServer(key)
      if (info.valid) {
        setSetting('license_key', key)
        setSetting('license_tier', info.tier)
        setSetting('license_validated_at', String(Date.now()))
        if (info.expiresAt) {
          setSetting('license_expires_at', String(info.expiresAt))
        }
      }
      return info
    })
  )

  ipcMain.handle('license:getTier', async () =>
    ipcResult(async () => {
      const key = getSetting('license_key')
      if (!key) {
        return 'free' as Tier
      }

      if (isCacheValid()) {
        const cached = getSetting('license_tier') as Tier | null
        if (cached === 'pro' || cached === 'team') {
          return cached
        }
      }

      try {
        const info = await validateWithServer(key)
        if (info.valid) {
          setSetting('license_tier', info.tier)
          setSetting('license_validated_at', String(Date.now()))
          return info.tier
        }
      } catch (error) {
        console.error('[license] getTier validation error:', error)
      }

      return 'free' as Tier
    })
  )
}
