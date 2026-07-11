import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  toggle: (originX?: number, originY?: number) => void
  setTheme: (theme: Theme) => void
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('televault-theme', theme)
}

// Run immediately on module load — before React renders anything
const saved = (localStorage.getItem('televault-theme') as Theme) || 'dark'
applyTheme(saved)

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: saved,

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  toggle: (originX?: number, originY?: number) => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'

    // Use View Transitions API if available (Chrome 111+ / modern Electron)
    if ('startViewTransition' in document) {
      const root = document.documentElement
      const ox = originX != null ? `${originX}px` : '50%'
      const oy = originY != null ? `${originY}px` : '50%'
      root.style.setProperty('--vt-origin', `${ox} ${oy}`)

      ;(document as any).startViewTransition(() => {
        applyTheme(next)
        set({ theme: next })
      })
    } else {
      // Fallback: plain CSS transition (works in older Chromium builds)
      applyTheme(next)
      set({ theme: next })
    }
  },
}))
