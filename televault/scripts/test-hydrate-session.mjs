/**
 * Regression test: hydrateSession() must ignore results from a superseded call.
 *
 * Scenario: two overlapping hydrateSession() calls where the FIRST resolves
 * AFTER the second. The store must end up with the SECOND call's data, and the
 * first call must report 'aborted' without writing anything (user, avatarUrl,
 * isLoading).
 *
 * Run with:
 *   node scripts/test-hydrate-session.mjs
 *
 * The store is compiled on the fly with esbuild (available in node_modules)
 * because the project has no test runner.
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = join(__dirname, '..')

// ── Mock window.televault with controllable promises ───────────────────────
function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const sessionQueue = []
const avatarQueue = []
let getSessionMode = 'normal' // 'normal' | 'fail'

globalThis.window = {
  televault: {
    auth: {
      getSession: () => {
        if (getSessionMode === 'fail') {
          return Promise.resolve({ success: false, error: 'network error' })
        }
        const d = deferred()
        sessionQueue.push(d)
        return d.promise
      },
      logout: () => Promise.resolve({ success: true }),
    },
    system: {
      getAvatarUrl: () => {
        const d = deferred()
        avatarQueue.push(d)
        return d.promise
      },
      getPersistedUser: () => ({ success: true, data: null }),
    },
    settings: {
      set: (key, value) => Promise.resolve({ success: true }),
    },
  },
}

let assertCount = 0
function assert(cond, label) {
  assertCount++
  if (cond) {
    console.log(`  ok ${assertCount}: ${label}`)
  } else {
    console.error(`  FAIL ${assertCount}: ${label}`)
    process.exit(1)
  }
}

const outDir = mkdtempSync(join(tmpdir(), 'hydrate-test-'))
const outFile = join(outDir, 'auth-store.mjs')

await build({
  entryPoints: [join(REPO_ROOT, 'src/store/auth.store.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  logLevel: 'silent',
})

try {
  const { useAuthStore } = await import(outFile)

  // ── Scenario A: stale first call must be ignored ─────────────────────────
  console.log('Scenario A: superseded call must be ignored')
  const store = useAuthStore.getState()
  useAuthStore.setState({ isLoggedIn: false, user: null, avatarUrl: null })

  const callA = store.hydrateSession() // initiated FIRST
  const callB = useAuthStore.getState().hydrateSession() // initiated SECOND

  assert(sessionQueue.length === 2, 'two getSession calls initiated')

  // B resolves first with fresh data.
  sessionQueue[1].resolve({
    success: true,
    data: { isLoggedIn: true, user: { id: '2', firstName: 'Yash', lastName: null, username: 'yash', phone: null } },
  })
  await new Promise((r) => setTimeout(r, 0))
  avatarQueue[0].resolve({ success: true, data: 'tvfile://avatars/fresh.jpg' })

  const statusB = await callB
  assert(statusB === 'signed_in', 'second (newest) call returns signed_in')

  // A resolves late with stale data.
  sessionQueue[0].resolve({
    success: true,
    data: { isLoggedIn: true, user: { id: '1', firstName: 'Stale', lastName: null, username: 'old', phone: null } },
  })
  await new Promise((r) => setTimeout(r, 0))
  const statusA = await callA
  assert(statusA === 'aborted', 'first (stale) call returns aborted')

  const final = useAuthStore.getState()
  assert(final.isLoggedIn === true, 'store is logged in')
  assert(final.user?.firstName === 'Yash', 'store has NEWEST call user (Yash), not stale (Stale)')
  assert(final.user?.username === 'yash', 'store user username from newest call')
  assert(final.avatarUrl === 'tvfile://avatars/fresh.jpg', 'avatarUrl from newest call')

  // ── Scenario B: user + avatarUrl update atomically ───────────────────────
  console.log('Scenario B: user + avatarUrl are committed atomically')
  useAuthStore.setState({ isLoggedIn: false, user: null, avatarUrl: null })
  sessionQueue.splice(0, sessionQueue.length)
  avatarQueue.splice(0, avatarQueue.length)
  const callC = useAuthStore.getState().hydrateSession()
  sessionQueue[0].resolve({
    success: true,
    data: { isLoggedIn: true, user: { id: '3', firstName: 'Alice', lastName: 'A', username: null, phone: null } },
  })
  await new Promise((r) => setTimeout(r, 0))
  // getSession resolved, avatar still pending → user must NOT be visible yet.
  const mid = useAuthStore.getState()
  assert(mid.user === null && mid.avatarUrl === null, 'no partial write before avatar resolves')
  avatarQueue[0].resolve({ success: true, data: 'tvfile://avatars/alice.jpg' })
  const statusC = await callC
  assert(statusC === 'signed_in', 'call returns signed_in')
  const afterC = useAuthStore.getState()
  assert(afterC.user?.firstName === 'Alice' && afterC.avatarUrl === 'tvfile://avatars/alice.jpg',
    'user + avatarUrl appear together after both resolve')

  // ── Scenario C: failed refetch preserves last-known-good ─────────────────
  console.log('Scenario C: failed session check keeps last-known-good user')
  useAuthStore.getState().setLoggedIn({
    id: '4', firstName: 'Bob', lastName: null, username: 'bob', phone: null,
  })
  getSessionMode = 'fail'
  const statusD = await useAuthStore.getState().hydrateSession()
  assert(statusD === 'signed_in', 'failed refetch reports signed_in')
  const afterD = useAuthStore.getState()
  assert(afterD.user?.firstName === 'Bob', 'last-known-good user preserved on failure')
  getSessionMode = 'normal'

  // ── Scenario D: persisted last-known-good seed restores identity ─────────
  console.log('Scenario D: persisted seed restores identity synchronously')
  window.televault.system.getPersistedUser = () => ({
    success: true,
    data: {
      user: { id: '9', firstName: 'Zed', lastName: null, username: 'zed', phone: null },
      avatarUrl: 'tvfile://avatars/z.jpg',
    },
  })
  const outFileD = join(outDir, 'auth-store-seeded.mjs')
  await build({
    entryPoints: [join(REPO_ROOT, 'src/store/auth.store.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outFileD,
    logLevel: 'silent',
  })
  const { useAuthStore: seededStore } = await import(outFileD)
  const seeded = seededStore.getState()
  assert(seeded.isLoggedIn === true, 'seed: isLoggedIn true from persisted user')
  assert(seeded.user?.firstName === 'Zed', 'seed: user restored before any async work')
  assert(seeded.avatarUrl === 'tvfile://avatars/z.jpg', 'seed: avatarUrl restored before any async work')

  console.log(`\nAll ${assertCount} assertions passed.`)
} finally {
  rmSync(outDir, { recursive: true, force: true })
}