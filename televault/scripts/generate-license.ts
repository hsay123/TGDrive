#!/usr/bin/env ts-node
/**
 * generate-license.ts
 * CLI to create a TeleVault license key and persist it to the DB.
 *
 * Usage:
 *   ts-node scripts/generate-license.ts --tier pro --email customer@example.com --lifetime
 *   ts-node scripts/generate-license.ts --tier team --email team@example.com --seats 10 --expires 2027-01-01
 *   ts-node scripts/generate-license.ts --tier pro --email user@example.com --notes "AppSumo deal"
 */

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../server/.env') })

import { createLicense } from '../server/db/licenses'

// ── Arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  return args[idx + 1]
}

function hasFlag(name: string): boolean {
  return args.includes(name)
}

const tier = getArg('--tier') as 'pro' | 'team' | undefined
const email = getArg('--email')
const seatsStr = getArg('--seats')
const seats = seatsStr ? parseInt(seatsStr, 10) : undefined
const lifetime = hasFlag('--lifetime')
const expiresStr = getArg('--expires')  // YYYY-MM-DD
const notes = getArg('--notes')

// ── Validation ───────────────────────────────────────────────────────────────

if (!tier || !email) {
  console.error(
    '\nUsage: ts-node generate-license.ts --tier pro|team --email EMAIL [--lifetime] [--seats N] [--expires YYYY-MM-DD] [--notes "text"]\n'
  )
  process.exit(1)
}

if (!['pro', 'team'].includes(tier)) {
  console.error(`Error: --tier must be "pro" or "team", got "${tier}"`)
  process.exit(1)
}

if (seats !== undefined && (isNaN(seats) || seats < 1)) {
  console.error('Error: --seats must be a positive integer')
  process.exit(1)
}

// ── Parse expiry ─────────────────────────────────────────────────────────────

let expiresAt: number | null = null

if (lifetime) {
  expiresAt = null  // lifetime — never expires
} else if (expiresStr) {
  const parsed = new Date(expiresStr).getTime()
  if (isNaN(parsed)) {
    console.error(`Error: --expires "${expiresStr}" is not a valid date. Use YYYY-MM-DD format.`)
    process.exit(1)
  }
  expiresAt = parsed
}
// If neither --lifetime nor --expires, default to null (lifetime)

// ── Create license ────────────────────────────────────────────────────────────

const license = createLicense({ tier, email, seats, expiresAt, notes })

// ── Format output ─────────────────────────────────────────────────────────────

const expiresDisplay = license.expires_at
  ? new Date(license.expires_at).toISOString().split('T')[0]
  : 'Never (Lifetime)'

const tierDisplay = tier.charAt(0).toUpperCase() + tier.slice(1)
const seatsDisplay = license.seats

const BOX_WIDTH = 46

function pad(text: string): string {
  const remaining = BOX_WIDTH - text.length - 4  // 4 for "║  " prefix and "  ║" suffix... actually "║  " + text + spaces + "║"
  return `║  ${text}${' '.repeat(Math.max(0, remaining))}║`
}

console.log('\n╔' + '═'.repeat(BOX_WIDTH - 2) + '╗')
console.log(pad('    TeleVault License Created        '))
console.log('╠' + '═'.repeat(BOX_WIDTH - 2) + '╣')
console.log(pad(`Key    : ${license.key}`))
console.log(pad(`Tier   : ${tierDisplay}`))
console.log(pad(`Email  : ${email}`))
console.log(pad(`Seats  : ${seatsDisplay}`))
console.log(pad(`Expires: ${expiresDisplay}`))
if (notes) console.log(pad(`Notes  : ${notes}`))
console.log('╚' + '═'.repeat(BOX_WIDTH - 2) + '╝')
console.log()
console.log('✅ Send this key to the customer.')
console.log('✅ They enter it in TeleVault → Settings → License → Activate.')
console.log()
