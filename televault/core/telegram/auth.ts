import { Api, errors } from 'telegram'
import {
  destroyClient,
  getApiCredentialsExport,
  getClient,
  getSetting,
  initClient,
  mapApiUser,
  persistSession,
  deleteSetting,
  warmEntityCache,
  type TGUser,
} from './client'
import { initializeChannels } from './channels'
import { clearEntityCache } from './channels'

function isRpcError(error: unknown): error is { errorMessage: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errorMessage' in error &&
    typeof (error as { errorMessage: unknown }).errorMessage === 'string'
  )
}

function handleAuthError(error: unknown): never {
  if (error instanceof errors.FloodWaitError) {
    throw new Error(`Too many attempts, wait ${error.seconds} seconds`)
  }

  if (isRpcError(error)) {
    switch (error.errorMessage) {
      case 'PHONE_CODE_INVALID':
        throw new Error('Invalid code')
      case 'PHONE_CODE_EXPIRED':
        throw new Error('Code expired, request a new one')
      case 'PASSWORD_HASH_INVALID':
        throw new Error('Wrong password')
      default:
        break
    }
  }

  throw error
}

export async function sendCode(
  phone: string,
  forceSMS = false
): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> {
  try {
    // Ensure client is initialized — lazily init if coming fresh from Setup
    // where the client may not have been initialized yet.
    let client
    try {
      client = getClient()
      if (!client.connected) await client.connect()
    } catch {
      console.log('[auth] Client not initialized, lazy-initializing from saved session...')
      const savedSession = getSetting('telegram_session') ?? ''
      await initClient(savedSession)
      client = getClient()
    }

    const credentials = getApiCredentialsExport()
    const result = await client.sendCode(credentials, phone, forceSMS)
    // Persist the session immediately after sendCode so any DC migration
    // (Phone migrated to X) is saved before signIn is called.
    persistSession()
    console.log(
      `[auth] sendCode ok for ${phone}, isCodeViaApp=${result.isCodeViaApp}, forceSMS=${forceSMS}`
    )
    return {
      phoneCodeHash: result.phoneCodeHash,
      isCodeViaApp: result.isCodeViaApp,
    }
  } catch (error) {
    console.error('[auth] sendCode error:', error)
    handleAuthError(error)
  }
}

export async function resendCode(
  phone: string,
  phoneCodeHash: string,
  forceSMS = false
): Promise<{ phoneCodeHash: string; isCodeViaApp: boolean }> {
  try {
    const client = getClient()
    if (!client.connected) {
      await client.connect()
    }

    if (forceSMS) {
      const credentials = getApiCredentialsExport()
      const result = await client.sendCode(credentials, phone, true)
      persistSession()
      console.log(`[auth] resendCode via SMS for ${phone}`)
      return {
        phoneCodeHash: result.phoneCodeHash,
        isCodeViaApp: result.isCodeViaApp,
      }
    }

    const resendResult = await client.invoke(
      new Api.auth.ResendCode({
        phoneNumber: phone,
        phoneCodeHash,
      })
    )

    if (resendResult instanceof Api.auth.SentCodeSuccess) {
      throw new Error('Already logged in')
    }

    persistSession()
    const isCodeViaApp = resendResult.type instanceof Api.auth.SentCodeTypeApp
    console.log(`[auth] resendCode ok for ${phone}, isCodeViaApp=${isCodeViaApp}`)
    return {
      phoneCodeHash: resendResult.phoneCodeHash,
      isCodeViaApp,
    }
  } catch (error) {
    console.error('[auth] resendCode error:', error)
    handleAuthError(error)
  }
}

export async function signIn(
  phone: string,
  phoneCodeHash: string,
  code: string
): Promise<{ status: 'success' | 'needs_2fa'; user?: TGUser }> {
  try {
    const client = getClient()
    const credentials = getApiCredentialsExport()

    try {
      // Use signInUser — the high-level helper that correctly handles DC
      // migration which can occur during sendCode (e.g. "Phone migrated to 1").
      // Raw client.invoke(Api.auth.SignIn) does NOT follow the migrated DC and
      // causes PHONE_CODE_INVALID. signInUser handles this transparently.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const user = await (client as any).signInUser(credentials, {
        phoneNumber: async () => phone,
        phoneCodeHash: async () => phoneCodeHash,
        phoneCode: async () => code,
        onError: async (err: unknown) => {
          if (isRpcError(err) && (err as {errorMessage:string}).errorMessage === 'SESSION_PASSWORD_NEEDED') {
            return true // signal 2FA needed
          }
          handleAuthError(err)
          return false
        },
      })

      persistSession()
      await warmEntityCache()
      // Initialize TeleVault Telegram channels after successful sign-in
      try {
        await initializeChannels()
      } catch (err) {
        console.error('[auth] Channel initialization failed after signIn (non-fatal):', err)
        // Don't block login — channels will be retried on first upload
      }
      return { status: 'success', user: mapApiUser(user) }
    } catch (error) {
      if (isRpcError(error) && error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        return { status: 'needs_2fa' }
      }
      handleAuthError(error)
    }
  } catch (error) {
    console.error('[auth] signIn error:', error)
    if (error instanceof Error && error.message === 'needs_2fa') {
      return { status: 'needs_2fa' }
    }
    throw error
  }
}

export async function complete2FA(password: string): Promise<{ user: TGUser }> {
  try {
    const client = getClient()
    const credentials = getApiCredentialsExport()

    const user = await client.signInWithPassword(credentials, {
      password: async () => password,
      onError: async (err) => {
        if (isRpcError(err) && err.errorMessage === 'PASSWORD_HASH_INVALID') {
          throw new Error('Wrong password')
        }
        return false
      },
    })

    persistSession()
    await warmEntityCache()
    // Initialize TeleVault Telegram channels after successful 2FA
    try {
      await initializeChannels()
    } catch (err) {
      console.error('[auth] Channel initialization failed after complete2FA (non-fatal):', err)
      // Don't block login — channels will be retried on first upload
    }
    return { user: mapApiUser(user) }
  } catch (error) {
    console.error('[auth] complete2FA error:', error)
    handleAuthError(error)
  }
}

export async function signOut(): Promise<void> {
  try {
    const client = getClient()
    await client.invoke(new Api.auth.LogOut())
  } catch (error) {
    console.error('[auth] signOut error:', error)
  } finally {
    clearEntityCache()
    await destroyClient()
    deleteSetting('telegram_session')
  }
}

export async function getCurrentUser(): Promise<TGUser | null> {
  try {
    const session = getSetting('telegram_session')
    if (!session) {
      return null
    }

    await initClient(session)
    const client = getClient()
    const authorized = await client.checkAuthorization()
    if (!authorized) {
      deleteSetting('telegram_session')
      await destroyClient()
      return null
    }

    const me = await client.getMe()
    if (!me || me instanceof Api.UserEmpty) {
      return null
    }

    await warmEntityCache()

    // On every startup, ensure channels exist (self-healing: covers cases
    // where initializeChannels() failed silently during login)
    try {
      await initializeChannels()
    } catch (err) {
      console.error('[auth] Channel init on startup failed (non-fatal):', err)
    }

    return mapApiUser(me)
  } catch (error) {
    // If the session key is no longer valid on Telegram's servers, clear it
    // so the user lands on a clean login screen instead of a stuck loading state.
    if (
      isRpcError(error) &&
      (error as { errorMessage: string }).errorMessage === 'AUTH_KEY_UNREGISTERED'
    ) {
      console.warn('[auth] Stale session detected, clearing and redirecting to login')
      deleteSetting('telegram_session')
      await destroyClient()
      return null
    }
    console.error('[auth] getCurrentUser error:', error)
    return null
  }
}

export async function hasValidSession(): Promise<boolean> {
  try {
    const session = getSetting('telegram_session')
    if (!session) {
      return false
    }

    await initClient(session)
    const client = getClient()
    const authorized = await client.checkAuthorization()
    if (!authorized) {
      deleteSetting('telegram_session')
      await destroyClient()
      return false
    }

    await client.getMe()
    return true
  } catch (error) {
    if (
      isRpcError(error) &&
      (error as { errorMessage: string }).errorMessage === 'AUTH_KEY_UNREGISTERED'
    ) {
      console.warn('[auth] Stale session in hasValidSession, clearing')
      deleteSetting('telegram_session')
      await destroyClient()
      return false
    }
    console.error('[auth] hasValidSession error:', error)
    return false
  }
}
