import { create } from 'zustand'
import { isTelevaultAvailable } from '../lib/electron'

interface AuthUser {
  id: string
  firstName: string
  lastName?: string
  username: string | null
  phone?: string
}

interface AuthStore {
  isLoggedIn: boolean
  user: AuthUser | null
  avatarUrl: string | null
  isLoading: boolean
  checkSession: () => Promise<void>
  setLoggedIn: (user: AuthUser) => void
  setAvatarUrl: (url: string | null) => void
  logout: () => Promise<void>
}

function mapUser(user: {
  id: string
  firstName: string
  lastName?: string
  username?: string
  phone?: string
}): AuthUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username || null,
    phone: user.phone,
  }
}

export const useAuthStore = create<AuthStore>((set) => ({
  isLoggedIn: false,
  user: null,
  avatarUrl: null,
  isLoading: true,

  checkSession: async () => {
    set({ isLoading: true })
    if (!isTelevaultAvailable()) {
      set({ isLoading: false })
      return
    }
    try {
      const result = await window.televault!.auth.getSession()
      if (result.success && result.data?.isLoggedIn && result.data.user) {
        set({
          isLoggedIn: true,
          user: mapUser(result.data.user),
          isLoading: false,
        })
      } else {
        set({ isLoggedIn: false, user: null, isLoading: false })
      }
    } catch {
      set({ isLoggedIn: false, user: null, isLoading: false })
    }
  },

  setLoggedIn: (user) => {
    set({ isLoggedIn: true, user, isLoading: false })
  },

  setAvatarUrl: (url) => {
    set({ avatarUrl: url })
  },

  logout: async () => {
    if (!isTelevaultAvailable()) return
    await window.televault!.auth.logout()
    set({ isLoggedIn: false, user: null })
  },
}))
