import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { Button } from '../components/shared/Button'
import { Input } from '../components/shared/Input'

export default function Setup() {
  const navigate = useNavigate()
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const id = apiId.trim()
    const hash = apiHash.trim()
    if (!id || !hash) {
      setError('Both API ID and API Hash are required')
      return
    }
    if (isNaN(Number(id))) {
      setError('API ID must be a number (e.g. 1234567)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.televault.system.saveApiCredentials(id, hash)
      if (!result.success) throw new Error(result.error ?? 'Failed to save credentials')
      // Navigate directly to login — do NOT go to "/" (would re-trigger AppInit)
      navigate('/login', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  function openTelegramApps() {
    window.televault.system.openExternal('https://my.telegram.org/apps')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-950 p-6 overflow-hidden">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-600/30">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">Welcome to TeleVault</h1>
          <p className="mt-1 text-sm text-gray-500">Connect your Telegram account to get started</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl space-y-5">
          {/* Instructions */}
          <div className="rounded-lg border border-gray-700/50 bg-gray-800/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Get your API credentials
            </p>
            <ol className="space-y-1.5 text-sm text-gray-400 list-decimal list-inside">
              <li>
                Go to{' '}
                <button
                  onClick={openTelegramApps}
                  className="text-violet-400 hover:text-violet-300 underline transition-colors"
                >
                  my.telegram.org/apps
                </button>
              </li>
              <li>Log in with your Telegram phone number</li>
              <li>Create a new application (any name)</li>
              <li>
                Copy your{' '}
                <span className="text-gray-200 font-medium">API ID</span> and{' '}
                <span className="text-gray-200 font-medium">API Hash</span>
              </li>
            </ol>
          </div>

          {/* Inputs */}
          <div className="space-y-3">
            <Input
              label="API ID"
              value={apiId}
              onChange={(e) => {
                setApiId(typeof e === 'string' ? e : e.target.value)
                setError(null)
              }}
              placeholder="e.g. 1234567"
              autoFocus
            />
            <Input
              label="API Hash"
              value={apiHash}
              onChange={(e) => {
                setApiHash(typeof e === 'string' ? e : e.target.value)
                setError(null)
              }}
              placeholder="e.g. a3f4c2d1e8b7a1234..."
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSave()}
            />
            {error && (
              <p className="text-xs text-red-400 px-0.5">{error}</p>
            )}
            <Button
              variant="primary"
              fullWidth
              loading={loading}
              onClick={handleSave}
              disabled={!apiId.trim() || !apiHash.trim()}
            >
              Continue →
            </Button>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-5 text-center text-xs text-gray-600 leading-relaxed">
          Your credentials are stored locally on this device only.<br />
          They are never sent to our servers.
        </p>
      </div>
    </div>
  )
}
