/// <reference types="vite/client" />

import type { TeleVaultAPI } from '../electron/types'

declare global {
  interface Window {
    televault: TeleVaultAPI
  }
}

export {}
