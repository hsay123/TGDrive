import { create } from 'zustand'
import { isTelevaultAvailable } from '../lib/electron'
import type { TGUser } from '../../electron/types'

export type AuthUser = TGUser

export type HydrateStatus = 'signed_in' | 'signed_out' | 'aborted'

interface AuthStore {
  isLoggedIn: boolean
  user: AuthUser | null
  avatarUrl: string | null
  isLoading: boolean
  /**
   * The single code path that restores a full session (user + avatar).
   * Results are committed to the store in ONE atomic set() so the UI can
   * never render "new user, old avatar" (or vice versa).
   *
   * Safe to call from effects that run more than once (StrictMode, hot reload,
   * remounts) or from multiple call sites: each call bumps a module-scoped
   * request token, and a call whose token is no longer the latest discards its
   * result entirely. Order of COMPLETION never decides the final state —
   * order of INITIATION does.
   */
  hydrateSession: () => Promise<HydrateStatus>
  setLoggedIn: (user: AuthUser) => void
  setAvatarUrl: (url: string | null) => void
  logout: () => Promise<void>
}

/**
 * Monotonic token used to make stale async responses from an older
 * hydrateSession() call a no-op. Only the most recently INITIATED call is
 * allowed to write to the store.
 */
let sessionRequestToken = 0

/** Settings key holding the last-known-good signed-in user (JSON). */
const LAST_USER_KEY = 'last_user'

/**
 * Persist the last-known-good signed-in user. This is cached DISPLAY data only —
 * hydrateSession() stays the single authoritative restore path. Empty string
 * clears the entry. Fire-and-forget: the atomic in-memory commit has already
 * happened by the time this runs.
 */
function persistUser(user: AuthUser | null): void {
  if (!isTelevaultAvailable()) return
  window.televault!.settings
    .set(LAST_USER_KEY, user ? JSON.stringify(user) : '')
    .catch(() => {})
}

/**
 * Seed the store synchronously from the persisted last-known-good session so a
 * reload on ANY route (not just "/") paints the correct identity before the
 * first paint — no "User"/"?" defaults flash while hydrateSession() revalidates.
 */
function readPersistedSeed(): { user: AuthUser; avatarUrl: string | null } | null {
  if (!isTelevaultAvailable()) return null
  try {
    const res = window.televault!.system.getPersistedUser()
    if (!res || !res.success || !res.data) return null
    return { user: res.data.user, avatarUrl: res.data.avatarUrl }
  } catch {
    return null
  }
}

const persistedSeed = readPersistedSeed()

export const useAuthStore = create<AuthStore>((set) => ({
  isLoggedIn: persistedSeed !== null,
  user: persistedSeed?.user ?? null,
  avatarUrl: persistedSeed?.avatarUrl ?? null,
  isLoading: true,

  hydrateSession: async () => {
    const requestToken = ++sessionRequestToken
    set({ isLoading: true })

    if (!isTelevaultAvailable()) {
      set({ isLoading: false })
      return 'signed_out'
    }

    try {
      const sessionResult = await window.televault!.auth.getSession()
      if (requestToken !== sessionRequestToken) return 'aborted'

      if (sessionResult.success && sessionResult.data?.isLoggedIn && sessionResult.data.user) {
        const avatarResult = await window.televault!.system.getAvatarUrl()
        if (requestToken !== sessionRequestToken) return 'aborted'

        // Atomic: user + avatarUrl are committed together, never separately.
        set({
          isLoggedIn: true,
          user: sessionResult.data.user,
          avatarUrl: avatarResult.success ? avatarResult.data : null,
          isLoading: false,
        })
        persistUser(sessionResult.data.user)
        return 'signed_in'
      }

      if (!sessionResult.success) {
        // Session check itself failed (IPC/network). If we already have a
        // logged-in user, keep the last-known-good state instead of clearing
        // it — a background refetch must never flicker the UI to defaults.
        if (useAuthStore.getState().user) {
          set({ isLoading: false })
          return 'signed_in'
        }
        set({ isLoggedIn: false, user: null, avatarUrl: null, isLoading: false })
        return 'signed_out'
      }

      // Authoritative: no valid session.
      set({ isLoggedIn: false, user: null, avatarUrl: null, isLoading: false })
      return 'signed_out'
    } catch {
      if (requestToken !== sessionRequestToken) return 'aborted'
      if (useAuthStore.getState().user) {
        set({ isLoading: false })
        return 'signed_in'
      }
      set({ isLoggedIn: false, user: null, avatarUrl: null, isLoading: false })
      return 'signed_out'
    }
  },

  setLoggedIn: (user) => {
    set({ isLoggedIn: true, user, isLoading: false })
    persistUser(user)
  },

  setAvatarUrl: (url) => {
    set({ avatarUrl: url })
  },

  logout: async () => {
    if (!isTelevaultAvailable()) return
    await window.televault!.auth.logout()
    set({ isLoggedIn: false, user: null, avatarUrl: null })
    persistUser(null)
  },
}))
