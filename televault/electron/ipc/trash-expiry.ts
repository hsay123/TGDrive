import { getExpiredTrashEntries, removeTrashEntryRecords } from '../../core/db/trash.db'
import type { TrashEntry } from '../../core/db/schema'

// Cleanup cadence: local DB references only (no Telegram API calls), so a
// once-a-day sweep is ample. This is consistent with the UI wording — removing
// a file from TeleVault leaves its data in Telegram until the user deletes the
// messages there. The sweep only drops the expired trash rows and their local
// chunk/version references.
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

// Wait after startup so the DB and IPC surface are fully initialized.
const STARTUP_SWEEP_DELAY_MS = 10_000

export interface TrashExpiryDeps {
  /** Returns trash rows whose 30-day retention window has elapsed. */
  getExpired: (now: number) => TrashEntry[]
  /** Drops only local references for one expired row. Never calls Telegram. */
  purgeLocal: (entry: TrashEntry) => void
  log?: (message: string) => void
  logError?: (message: string, error: unknown) => void
}

function defaultDeps(): TrashExpiryDeps {
  return {
    getExpired: getExpiredTrashEntries,
    purgeLocal: removeTrashEntryRecords,
    log: (message) => console.log(message),
    logError: (message, error) => console.error(message, error),
  }
}

/**
 * One expiry pass, dependency-injected so it can be unit-tested without native
 * modules. Each row is purged independently: a single failure is retained for
 * the next sweep instead of aborting the rest.
 */
export async function runTrashExpirySweepOnce(
  deps: TrashExpiryDeps = defaultDeps(),
  now: number = Date.now()
): Promise<{ purged: number; failed: number }> {
  const expired = deps.getExpired(now)
  if (expired.length === 0) return { purged: 0, failed: 0 }

  deps.log?.(`[trash-expiry] Sweep start: ${expired.length} expired item(s)`)

  let purged = 0
  let failed = 0
  for (const entry of expired) {
    try {
      // Local references only — never a Telegram message delete. Purged trash
      // leaves the file's messages in Telegram; unlike "Delete permanently",
      // this path does not delete them from the user's account.
      deps.purgeLocal(entry)
      purged++
    } catch (error) {
      failed++
      deps.logError?.(
        `[trash-expiry] Failed to purge ${entry.id} (${entry.original_path}) — retained for retry:`,
        error
      )
    }
  }

  deps.log?.(`[trash-expiry] Sweep complete: ${purged} purged, ${failed} failed (retained)`)
  return { purged, failed }
}

let trashExpiryInterval: ReturnType<typeof setInterval> | null = null
let startupSweepTimer: ReturnType<typeof setTimeout> | null = null
let sweepInProgress = false

async function sweep(): Promise<void> {
  if (sweepInProgress) return
  sweepInProgress = true
  try {
    await runTrashExpirySweepOnce()
  } catch (error) {
    console.error('[trash-expiry] Sweep error:', error)
  } finally {
    sweepInProgress = false
  }
}

function clearTrashExpiry(): void {
  if (trashExpiryInterval) {
    clearInterval(trashExpiryInterval)
    trashExpiryInterval = null
  }
  if (startupSweepTimer) {
    clearTimeout(startupSweepTimer)
    startupSweepTimer = null
  }
}

function setupTrashExpiryInterval(): void {
  clearTrashExpiry()
  trashExpiryInterval = setInterval(() => {
    sweep()
  }, SWEEP_INTERVAL_MS)

  // Once on app startup, shortly after the IPC surface is registered.
  startupSweepTimer = setTimeout(() => {
    sweep()
  }, STARTUP_SWEEP_DELAY_MS)
}

/**
 * Wire the trash expiry sweep into the app: a startup sweep plus a once-a-day
 * interval. Idempotent — safe to call multiple times.
 */
export function registerTrashExpiry(): void {
  setupTrashExpiryInterval()
}

/** Clear any pending sweep timers (e.g. during shutdown/tests). */
export function stopTrashExpiry(): void {
  clearTrashExpiry()
}

/** Exposed for tests and manual runs. */
export function triggerTrashExpirySweep(): Promise<void> {
  return sweep()
}
