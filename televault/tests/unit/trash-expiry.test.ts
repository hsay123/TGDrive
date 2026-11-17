import { describe, expect, it, vi } from 'vitest'

// trash-expiry imports the DB helpers for its production defaults. Stub the
// module before loading so the native better-sqlite3 binding is never required;
// the sweep under test is exercised through injected dependencies.
vi.mock('../../core/db/trash.db', () => ({
  getExpiredTrashEntries: vi.fn(),
  removeTrashEntryRecords: vi.fn(),
}))

import { runTrashExpirySweepOnce, type TrashExpiryDeps } from '../../electron/ipc/trash-expiry'
import type { TrashEntry } from '../../core/db/schema'

const NOW = 1_700_000_000_000

function entry(id: string): TrashEntry {
  return {
    id,
    original_path: `/docs/${id}.txt`,
    file_id: `file-${id}`,
    folder_id: null,
    file_data: null,
    deleted_at: NOW - 31 * 24 * 60 * 60 * 1000,
    expires_at: NOW - 24 * 60 * 60 * 1000,
  }
}

function deps(overrides: Partial<TrashExpiryDeps> = {}): TrashExpiryDeps {
  return {
    getExpired: () => [],
    purgeLocal: () => undefined,
    log: () => undefined,
    logError: () => undefined,
    ...overrides,
  }
}

describe('trash expiry sweep (local references only)', () => {
  it('purges every expired row older than 30 days via the local-only path', async () => {
    const expired = [entry('a'), entry('b'), entry('c')]
    const purgeLocal = vi.fn()
    const getExpired = vi.fn(() => expired)

    const result = await runTrashExpirySweepOnce(deps({ getExpired, purgeLocal }), NOW)

    expect(getExpired).toHaveBeenCalledWith(NOW)
    expect(purgeLocal).toHaveBeenCalledTimes(3)
    expect(purgeLocal.mock.calls.map(([e]) => e.id)).toEqual(['a', 'b', 'c'])
    expect(result).toEqual({ purged: 3, failed: 0 })
  })

  it('passes the current time to the expiry query and does nothing when none are expired', async () => {
    const getExpired = vi.fn(() => [])
    const purgeLocal = vi.fn()

    const result = await runTrashExpirySweepOnce(deps({ getExpired, purgeLocal }), NOW)

    expect(getExpired).toHaveBeenCalledWith(NOW)
    expect(purgeLocal).not.toHaveBeenCalled()
    expect(result).toEqual({ purged: 0, failed: 0 })
  })

  it('keeps a failing row for retry and still purges the remaining rows', async () => {
    const purgeLocal = vi.fn((e: TrashEntry) => {
      if (e.id === 'bad') throw new Error('locked')
    })
    const logError = vi.fn()

    const result = await runTrashExpirySweepOnce(
      deps({
        getExpired: () => [entry('bad'), entry('good')],
        purgeLocal,
        logError,
      }),
      NOW
    )

    expect(result).toEqual({ purged: 1, failed: 1 })
    expect(purgeLocal).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('bad'),
      expect.any(Error)
    )
  })
})
