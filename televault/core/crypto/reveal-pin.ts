import keytar from 'keytar'
import crypto from 'crypto'

const SERVICE = 'televault'
const ACCOUNT = 'reveal-pin'

export async function setRevealPin(pin: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(pin).digest('hex')
  await keytar.setPassword(SERVICE, ACCOUNT, hash)
}

export async function verifyRevealPin(pin: string): Promise<boolean> {
  const stored = await keytar.getPassword(SERVICE, ACCOUNT)
  if (!stored) return false
  const hash = crypto.createHash('sha256').update(pin).digest('hex')
  return stored === hash
}

export async function hasRevealPin(): Promise<boolean> {
  const stored = await keytar.getPassword(SERVICE, ACCOUNT)
  return stored !== null
}

export async function deleteRevealPin(): Promise<void> {
  await keytar.deletePassword(SERVICE, ACCOUNT)
}
