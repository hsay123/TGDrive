import { getDb } from './db'
import { customAlphabet } from 'nanoid'
import { v4 as uuidv4 } from 'uuid'

const alphabet = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 4)

export interface License {
  id: string
  key: string
  tier: 'pro' | 'team'
  email: string
  seats: number
  active: number           // 1 = active, 0 = deactivated
  created_at: number
  expires_at: number | null
  notes: string | null
  last_validated_at: number | null
}

export interface Activation {
  id: string
  license_key: string
  machine_id: string
  activated_at: number
  last_seen: number
}

// Generate a key like: TV-XXXX-XXXX-XXXX-XXXX
export function generateLicenseKey(): string {
  return `TV-${alphabet()}-${alphabet()}-${alphabet()}-${alphabet()}`
}

// Create and persist a new license
export function createLicense(data: {
  tier: 'pro' | 'team'
  email: string
  seats?: number
  expiresAt?: number | null   // null = never (lifetime)
  notes?: string
}): License {
  const db = getDb()
  const license: License = {
    id: uuidv4(),
    key: generateLicenseKey(),
    tier: data.tier,
    email: data.email,
    seats: data.seats ?? (data.tier === 'team' ? 5 : 3),
    active: 1,
    created_at: Date.now(),
    expires_at: data.expiresAt ?? null,
    notes: data.notes ?? null,
    last_validated_at: null,
  }
  db.prepare(`
    INSERT INTO licenses (id, key, tier, email, seats, active, created_at, expires_at, notes, last_validated_at)
    VALUES (@id, @key, @tier, @email, @seats, @active, @created_at, @expires_at, @notes, @last_validated_at)
  `).run(license)
  return license
}

// Get license by key
export function getLicenseByKey(key: string): License | undefined {
  return getDb().prepare('SELECT * FROM licenses WHERE key = ?').get(key) as License | undefined
}

// Get all licenses (for admin)
export function getAllLicenses(): License[] {
  return getDb().prepare('SELECT * FROM licenses ORDER BY created_at DESC').all() as License[]
}

// Get activations for a license
export function getActivations(licenseKey: string): Activation[] {
  return getDb()
    .prepare('SELECT * FROM activations WHERE license_key = ? ORDER BY activated_at DESC')
    .all(licenseKey) as Activation[]
}

// Validate a license key against a machine ID
export function validateLicense(
  key: string,
  machineId: string
): { valid: boolean; tier: 'pro' | 'team' | null; expiresAt: number | null; reason?: string } {
  const db = getDb()
  const license = getLicenseByKey(key)

  if (!license) return { valid: false, tier: null, expiresAt: null, reason: 'not_found' }
  if (!license.active) return { valid: false, tier: null, expiresAt: null, reason: 'inactive' }
  if (license.expires_at && license.expires_at < Date.now()) {
    return { valid: false, tier: null, expiresAt: license.expires_at, reason: 'expired' }
  }

  // Check if this machine is already activated
  const existing = db
    .prepare('SELECT * FROM activations WHERE license_key = ? AND machine_id = ?')
    .get(key, machineId) as Activation | undefined

  if (!existing) {
    // New machine — check seat count
    const activationCount = (
      db.prepare('SELECT COUNT(*) as c FROM activations WHERE license_key = ?').get(key) as { c: number }
    ).c

    if (activationCount >= license.seats) {
      return { valid: false, tier: null, expiresAt: null, reason: 'seat_limit_reached' }
    }

    // Activate this machine
    db.prepare(`
      INSERT INTO activations (id, license_key, machine_id, activated_at, last_seen)
      VALUES (?, ?, ?, ?, ?)
    `).run(uuidv4(), key, machineId, Date.now(), Date.now())
  } else {
    // Update last_seen
    db.prepare('UPDATE activations SET last_seen = ? WHERE license_key = ? AND machine_id = ?')
      .run(Date.now(), key, machineId)
  }

  // Update last_validated_at
  db.prepare('UPDATE licenses SET last_validated_at = ? WHERE key = ?').run(Date.now(), key)

  return { valid: true, tier: license.tier, expiresAt: license.expires_at }
}

// Deactivate a specific machine from a license
export function deactivateMachine(licenseKey: string, machineId: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM activations WHERE license_key = ? AND machine_id = ?')
    .run(licenseKey, machineId)
  return result.changes > 0
}

// Deactivate entire license (e.g. refund)
export function deactivateLicense(key: string): void {
  getDb().prepare('UPDATE licenses SET active = 0 WHERE key = ?').run(key)
}

// Log a validation attempt
export function logValidation(key: string, machineId: string | null, status: string, ip: string): void {
  getDb().prepare(`
    INSERT INTO validation_log (id, license_key, machine_id, status, ip, validated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), key, machineId, status, ip, Date.now())
}
