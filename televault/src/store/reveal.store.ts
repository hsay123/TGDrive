import { create } from 'zustand'

interface RevealStore {
  isUnlocked: boolean
  hasPin: boolean
  setUnlocked: (value: boolean) => void
  setHasPin: (value: boolean) => void
}

export const useRevealStore = create<RevealStore>((set) => ({
  isUnlocked: false,
  hasPin: false,
  setUnlocked: (value) => set({ isUnlocked: value }),
  setHasPin: (value) => set({ hasPin: value }),
}))
