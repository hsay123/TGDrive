import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spinner } from './shared/Spinner'
import { useAuthStore } from '../store/auth.store'

/**
 * Runs ONCE at app start from the root "/" path.
 * Decides where to send the user — /setup, /login, or /drive.
 * Never re-runs. All other routes are standalone pages with no init logic.
 */
export function AppInit() {
  const navigate = useNavigate()
  const setLoggedIn = useAuthStore((s) => s.setLoggedIn)

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

        // Step 2 — is there a valid Telegram session?
        const sessionResult = await window.televault.auth.getSession()
        if (cancelled) return

        if (sessionResult.success && sessionResult.data?.isLoggedIn && sessionResult.data.user) {
          console.log('[AppInit] Session valid → /drive')
          setLoggedIn({
            id: sessionResult.data.user.id,
            firstName: sessionResult.data.user.firstName,
            username: sessionResult.data.user.username || null,
          })
          navigate('/drive', { replace: true })
        } else {
          console.log('[AppInit] No session → /login')
          navigate('/login', { replace: true })
        }
      } catch (err) {
        console.error('[AppInit] init error:', err)
        navigate('/login', { replace: true })
      }
    }

    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Render a spinner while we decide
  return (
    <div className="flex h-screen items-center justify-center bg-gray-950">
      <Spinner size="lg" />
    </div>
  )
}
