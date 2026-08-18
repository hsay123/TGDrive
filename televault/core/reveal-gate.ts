let unlocked = false

export function isRevealGateUnlocked(): boolean {
  return unlocked
}

export function setRevealGateUnlocked(value: boolean): void {
  unlocked = value
}
