import { getExpiredTrashEntries } from '../../core/db/trash.db'
import { channelsReady } from '../../core/telegram/channels'
import { permanentlyDeleteFile } from './files.ipc'

// Cleanup sweep cadence. This involves real Telegram API calls (message
// deletion), so keep it to once a day — it must not add rate-limit pressure.
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000

// Wait after startup so the Telegram client and channels have a chance to
// initialize before the first sweep runs.
const STARTUP_SWEEP_DELAY_MS = 10_000

let trashExpiryInterval: ReturnType<typeof setInterval> | null = null
let startupSweepTimer: ReturnType<typeof setTimeout> | null = null

// Each expired row is deleted independently (Telegram-first) and failures are
// retried on the next sweep, so a single failure never aborts the whole sweep.
let sweepInProgress = false

async function runTrashExpirySweep(): Promise<void> {
  if (sweepInProgress) return
  sweepInProgress = true

  try {
    if (!channelsReady().ready) {
      console.log('[trash-expiry] Sweep skipped — Telegram channels not initialized yet')
      return
    }

    const expired = getExpiredTrashEntries()
    if (expired.length === 0) {
      return
    }

    let purged = 0
    let failed = 0
    console.log(`[trash-expiry] Sweep start: ${expired.length} expired item(s)`)

    for (const entry of expired) {
      try {
        // Same Telegram-delete-first path as the UI's "Delete permanently".
        await permanentlyDeleteFile(entry.id)
        purged++
      } catch (err) {
        failed++
        // Leave this row alone so the next sweep retries it. Do not let one
        // failure abort the remaining items.
        console.error(
          `[trash-expiry] Failed to purge ${entry.id} (${entry.original_path}) — retained for retry:`,
          err
        )
      }
    }

    console.log(`[trash-expiry] Sweep complete: ${purged} purged, ${failed} failed (retained)`)
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
    runTrashExpirySweep().catch((err) =>
      console.error('[trash-expiry] Interval sweep error:', err)
    )
  }, SWEEP_INTERVAL_MS)

  // Once on app startup, shortly after the IPC surface is registered.
  startupSweepTimer = setTimeout(() => {
    runTrashExpirySweep().catch((err) =>
      console.error('[trash-expiry] Startup sweep error:', err)
    )
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
  return runTrashExpirySweep()
}