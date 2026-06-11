#!/usr/bin/env ts-node
/**
 * list-licenses.ts
 * CLI to view all TeleVault licenses in the database.
 *
 * Usage:
 *   ts-node scripts/list-licenses.ts
 *   ts-node scripts/list-licenses.ts --active-only
 *   ts-node scripts/list-licenses.ts --tier pro
 *   ts-node scripts/list-licenses.ts --active-only --tier team
 */

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../server/.env') })

import { getAllLicenses, getActivations, License } from '../server/db/licenses'

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

const activeOnly = hasFlag('--active-only')
const filterTier = getArg('--tier') as 'pro' | 'team' | undefined

// ── Fetch + filter ───────────────────────────────────────────────────────────

let licenses: License[] = getAllLicenses()

if (activeOnly) {
  licenses = licenses.filter(l => l.active === 1)
}

if (filterTier) {
  licenses = licenses.filter(l => l.tier === filterTier)
}

if (licenses.length === 0) {
  console.log('\nNo licenses found.\n')
  process.exit(0)
}

// ── Format table ─────────────────────────────────────────────────────────────

function formatDate(ts: number | null): string {
  if (!ts) return 'never'
  return new Date(ts).toISOString().split('T')[0]
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

// Calculate machine usage per license
const rows = licenses.map(l => {
  const activations = getActivations(l.key)
  return {
    key: l.key,
    tier: l.tier,
    email: truncate(l.email, 28),
    seats: l.seats,
    active: l.active === 1 ? 'yes' : 'NO',
    expires: formatDate(l.expires_at),
    machines: `${activations.length}/${l.seats}`,
    created: formatDate(l.created_at),
  }
})

// Column widths
const COL = {
  key: 24,
  tier: 5,
  email: 28,
  seats: 5,
  active: 6,
  expires: 12,
  machines: 8,
}

function col(val: string | number, width: number): string {
  const s = String(val)
  return s.padEnd(width)
}

const header =
  col('KEY', COL.key) + '  ' +
  col('TIER', COL.tier) + '  ' +
  col('EMAIL', COL.email) + '  ' +
  col('SEATS', COL.seats) + '  ' +
  col('ACTIVE', COL.active) + '  ' +
  col('EXPIRES', COL.expires) + '  ' +
  col('MACHINES', COL.machines)

const divider = '─'.repeat(header.length)

console.log()
console.log(`TeleVault Licenses (${licenses.length} total${activeOnly ? ', active only' : ''}${filterTier ? `, tier=${filterTier}` : ''})`)
console.log(divider)
console.log(header)
console.log(divider)

for (const r of rows) {
  console.log(
    col(r.key, COL.key) + '  ' +
    col(r.tier, COL.tier) + '  ' +
    col(r.email, COL.email) + '  ' +
    col(r.seats, COL.seats) + '  ' +
    col(r.active, COL.active) + '  ' +
    col(r.expires, COL.expires) + '  ' +
    col(r.machines, COL.machines)
  )
}

console.log(divider)
console.log()
