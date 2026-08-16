import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from './shared/Spinner'
import { useAuthStore } from '../store/auth.store'

/**
 * Runs ONCE at app start from the root "/" path.
 * Decides where to send the user — /setup, /login, or /drive.
 * Never re-runs. All other routes are standalone pages with no init logic.
 *
 * The actual session restore (user + avatar, atomically) lives in
 * auth.store's hydrateSession(); AppInit only decides navigation based on its
 * result and must not re-implement any user/avatar mapping here.
 */
export function AppInit() {
  const navigate = useNavigate()
  const hydrateSession = useAuthStore((s) => s.hydrateSession)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // Step 1 — do we have Telegram API credentials?
        const credsResult = await window.televault.system.hasApiCredentials()
        if (cancelled) return

        if (!credsResult.success || !credsResult.data) {
          console.log('[AppInit] No API credentials → /setup')
          navigate('/setup', { replace: true })
          return
        }

        // Step 2 — restore the full session (user + avatar) in one place.
        const status = await hydrateSession()
        if (cancelled) return

        if (status === 'signed_in') {
          console.log('[AppInit] Session valid → /drive')
          navigate('/drive', { replace: true })
        } else if (status === 'signed_out') {
          console.log('[AppInit] No session → /login')
          navigate('/login', { replace: true })
        }
        // status === 'aborted' means a newer hydrateSession superseded this
        // one — never navigate based on a stale result.
      } catch (err) {
        console.error('[AppInit] init error:', err)
        navigate('/login', { replace: true })
      }
    }

    init()
    return () => { cancelled = true }
  }, [hydrateSession])

  // Render a spinner while we decide
  return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <Spinner size="lg" />
    </div>
  )
}
