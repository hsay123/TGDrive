#!/usr/bin/env ts-node
/**
 * seed-dev.ts
 * Seeds deterministic test license keys for local development.
 * Run once after setting up the server for the first time.
 *
 * Usage:
 *   ts-node scripts/seed-dev.ts
 */

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../server/.env') })

import { getDb } from '../server/db/db'
import { getLicenseByKey, License } from '../server/db/licenses'
import { v4 as uuidv4 } from 'uuid'

// Deterministic test keys — easy to remember during development
const DEV_KEYS = {
  pro: 'TV-TEST-PR00-AAAA-BBBB',
  team: 'TV-TEST-TEAM-CCCC-DDDD',
}

function seedKey(key: string, tier: 'pro' | 'team', email: string, seats: number): License {
  const db = getDb()

  // Check if already exists
  const existing = getLicenseByKey(key)
  if (existing) {
    return existing
  }

  const license: License = {
    id: uuidv4(),
    key,
    tier,
    email,
    seats,
    active: 1,
    created_at: Date.now(),
    expires_at: null,  // lifetime
    notes: 'Dev seed — do not use in production',
    last_validated_at: null,
  }

  db.prepare(`
    INSERT INTO licenses (id, key, tier, email, seats, active, created_at, expires_at, notes, last_validated_at)
    VALUES (@id, @key, @tier, @email, @seats, @active, @created_at, @expires_at, @notes, @last_validated_at)
  `).run(license)

  return license
}

console.log('\n=== TeleVault Dev Seeds ===\n')

const pro = seedKey(DEV_KEYS.pro, 'pro', 'dev-pro@televault.test', 3)
const team = seedKey(DEV_KEYS.team, 'team', 'dev-team@televault.test', 5)

console.log('Test license keys:')
console.log(`  Pro  : ${pro.key}  (3 seats, lifetime)`)
console.log(`  Team : ${team.key}  (5 seats, lifetime)`)
console.log()
console.log('Enter these in Settings → License → Activate to test Pro/Team features.')
console.log()
console.log('Setup checklist:')
console.log('  [ ] Add TELEGRAM_API_ID to .env')
console.log('  [ ] Add TELEGRAM_API_HASH to .env')
console.log('  [ ] Run: npm run dev (from /televault)')
console.log('  [ ] cd server && npm run dev (in a separate terminal)')
console.log('  [ ] Log in with your Telegram number')
console.log('  [ ] Enter a test key in Settings → License')
console.log()
