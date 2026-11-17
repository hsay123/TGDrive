/**
 * Thin wrapper around the OS credential store (keytar).
 *
 * Why not Electron's built-in `safeStorage`?
 *   - On Linux it needs libsecret (or kwallet) exactly like keytar does, so it
 *     buys nothing on the platform where that dependency actually bites.
 *   - The encryption key produced by keystore.ts is required to decrypt files
 *     already uploaded by existing installs. Migrating the backing store means
 *     every existing user must have their key migrated forward first, or their
 *     encrypted files become permanently unreadable.
 *
 * What this wrapper does buy us: keytar dlopen()s libsecret lazily on first use,
 * and on a Linux box without libsecret that throws a raw, unreadable loader
 * error deep inside a require(). Here it becomes one cached, actionable error
 * that we can surface in the UI.
 */

type Keytar = typeof import('keytar')

let cached: Keytar | null = null
let failure: Error | null = null

function missingLibsecretHint(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return (
      'TeleVault could not reach the OS credential store (libsecret). ' +
      'On Debian/Ubuntu run: sudo apt install libsecret-1-0 ' +
      '(or install the .deb build, which declares this dependency). ' +
      'This is required to read your encryption key.'
    )
  }
  return 'TeleVault could not reach the OS credential store.'
}

function load(): Keytar {
  if (cached) return cached
  if (failure) throw failure

  try {
    // Required lazily: a top-level import would throw during module init and
    // take down anything that transitively imports this file.
    // keytar publishes named exports (no __esModule), so require() hands back
    // the function object directly. The .default branch is only a guard in case
    // some toolchain ever transpiles it into an ES-module namespace.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('keytar') as Keytar & { default?: Keytar }
    cached = mod.default ?? mod
    return cached
  } catch (err) {
    failure = new Error(`${missingLibsecretHint(process.platform)} (${
      err instanceof Error ? err.message : String(err)
    })`)
    throw failure
  }
}

/** Test seam: lets callers assert the store is reachable without side effects. */
export function credentialStoreAvailable(): boolean {
  try {
    load()
    return true
  } catch {
    return false
  }
}

export async function getSecret(service: string, account: string): Promise<string | null> {
  return load().getPassword(service, account)
}

export async function setSecret(
  service: string,
  account: string,
  secret: string
): Promise<void> {
  await load().setPassword(service, account, secret)
}

export async function deleteSecret(service: string, account: string): Promise<boolean> {
  return load().deletePassword(service, account)
}
