import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Shield, RefreshCw, HardDrive, Lock, Key } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../components/shared/Button'
import { useAuthStore } from '../store/auth.store'
import { useSync } from '../hooks/useSync'
import { useState, useEffect } from 'react'
import clsx from 'clsx'

type Tab = 'account' | 'storage' | 'encryption' | 'sync'

const TABS: { id: Tab; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'storage', label: 'Storage' },
  { id: 'encryption', label: 'Encryption' },
  { id: 'sync', label: 'Sync' },
]

export default function Settings() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { status, push, pull, isSyncing } = useSync()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<Tab>('account')
  const [encryptionEnabled, setEncryptionEnabled] = useState(false)
  const [autoSync, setAutoSync] = useState('0')
  const [version, setVersion] = useState('0.1.0')
  const [fingerprint, setFingerprint] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [maskedApiId, setMaskedApiId] = useState<string | null>(null)

  useEffect(() => {
    window.televault.settings.get('encryption_enabled').then((r) => {
      if (r.success) setEncryptionEnabled(r.data === '1')
    })
    window.televault.settings.get('auto_sync_interval').then((r) => {
      if (r.success && r.data) setAutoSync(r.data)
    })
    window.televault.settings.getKeyFingerprint().then((r) => {
      if (r.success && r.data) setFingerprint(r.data)
    })
    window.televault.system.getAppVersion().then((r) => {
      if (r.success && r.data) setVersion(r.data)
    })
    // Load API ID for display (masked)
    window.televault.settings.get('telegram_api_id').then((r) => {
      if (r.success && r.data) {
        const id = r.data
        setMaskedApiId(id.length > 3 ? `${id.slice(0, 3)}${'•'.repeat(id.length - 3)}` : '•••')
      }
    })
  }, [])

  const handleToggleEncryption = async () => {
    const next = !encryptionEnabled
    const result = await window.televault.settings.set('encryption_enabled', next ? '1' : '0')
    if (result.success) {
      setEncryptionEnabled(next)
      toast.success(next ? 'Encryption enabled' : 'Encryption disabled')
    }
  }

  const handleAutoSyncChange = async (value: string) => {
    const result = await window.televault.settings.set('auto_sync_interval', value)
    if (result.success) {
      setAutoSync(value)
      toast.success('Auto-sync setting saved')
    }
  }

  const handleLogout = async () => {
    if (!confirm('Sign out of TeleVault? You can sign back in at any time.')) return
    setIsLoggingOut(true)
    try {
      await logout()
      navigate('/login')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const formatSyncTime = (ts: number | null | undefined) => {
    if (!ts) return 'Never'
    const diff = Date.now() - ts
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} minutes ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hours ago`
    return new Date(ts).toLocaleDateString()
  }

  const initials = user?.firstName?.[0]?.toUpperCase() ?? 'U'

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Drive
        </Link>

        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
          <span className="text-xs text-gray-600">v{version}</span>
        </div>

        {/* Tab bar */}
        <div className="mb-6 mt-4 flex border-b border-gray-800 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Account Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'account' && (
          <div className="space-y-4">
            {/* User profile */}
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-xl font-bold text-white">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-gray-100">{user?.firstName ?? 'User'}</p>
                  {user?.username && (
                    <p className="text-sm text-gray-500">@{user.username}</p>
                  )}
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-gray-800 pt-4">
                <div>
                  <p className="text-sm text-gray-400">Signed in via Telegram</p>
                  <p className="text-xs text-gray-600">Files stored in your personal Telegram account</p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  loading={isLoggingOut}
                  onClick={handleLogout}
                >
                  Sign Out
                </Button>
              </div>
            </div>

            {/* Telegram API credentials */}
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Key className="h-5 w-5 text-violet-400" />
                <h3 className="font-semibold text-gray-100">Telegram API</h3>
              </div>
              <div className="space-y-3">
                {maskedApiId && (
                  <div className="rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2.5 flex items-center gap-2">
                    <span className="text-xs text-gray-500">API ID</span>
                    <code className="text-xs font-mono text-gray-300 ml-auto">{maskedApiId}</code>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  Need to use a different Telegram account? Re-enter your API credentials below.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/setup')}
                >
                  Change API Credentials
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Storage Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'storage' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
              <div className="flex items-center gap-3 mb-4">
                <HardDrive className="h-5 w-5 text-violet-400" />
                <h3 className="font-semibold text-gray-100">Telegram Channels</h3>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Storage channel', key: 'storage_channel_id' },
                  { label: 'Index channel', key: 'index_channel_id' },
                  { label: 'Trash channel', key: 'trash_channel_id' },
                ].map(({ label, key }) => (
                  <div key={key} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 px-3 py-2.5">
                    <span className="text-xs text-gray-400">{label}</span>
                    <code className="font-mono text-xs text-gray-300">–</code>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
              <h3 className="mb-1 font-semibold text-gray-100">Thumbnails</h3>
              <p className="mb-4 text-xs text-gray-500">
                Generate thumbnails for images uploaded before thumbnail support was added.
              </p>
              <Button
                variant="secondary"
                size="sm"
                loading={isBackfilling}
                onClick={async () => {
                  setIsBackfilling(true)
                  try {
                    const result = await window.televault.files.backfillThumbnails()
                    if (result.success && result.data) {
                      toast.success(`Generated ${result.data.processed} of ${result.data.total} thumbnails`)
                    } else {
                      toast.error(result.error ?? 'Thumbnail backfill failed')
                    }
                  } finally {
                    setIsBackfilling(false)
                  }
                }}
              >
                Generate Missing Thumbnails
              </Button>
            </div>

            <div className="rounded-xl border border-red-800/30 bg-red-900/5 p-6">
              <h3 className="mb-1 font-semibold text-red-300">Danger Zone</h3>
              <p className="mb-4 text-xs text-gray-500">
                Re-initialize creates new Telegram channels. Existing files remain accessible but folder structure resets.
              </p>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Re-initialize channels? Folder structure will reset, but files remain accessible.')) {
                    toast.error('Not implemented yet')
                  }
                }}
              >
                Re-initialize Channels
              </Button>
            </div>
          </div>
        )}

        {/* ── Encryption Tab ───────────────────────────────────────────────── */}
        {activeTab === 'encryption' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-violet-400" />
                <h3 className="font-semibold text-gray-100">AES-256-GCM Encryption</h3>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-300">Encrypt new uploads</p>
                  <p className="text-xs text-gray-500">Files are encrypted before leaving your device</p>
                </div>
                <button
                  onClick={handleToggleEncryption}
                  className={clsx(
                    'relative h-6 w-11 rounded-full transition-colors duration-200',
                    encryptionEnabled ? 'bg-violet-600' : 'bg-gray-700'
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                      encryptionEnabled && 'translate-x-5'
                    )}
                  />
                </button>
              </div>

              {fingerprint && (
                <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3">
                  <p className="mb-1 text-xs text-gray-500">Key fingerprint</p>
                  <code className="text-xs font-mono text-teal-300">{fingerprint}</code>
                </div>
              )}

              <div className="rounded-lg border border-amber-700/20 bg-amber-600/5 p-3">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-400">
                    Files are encrypted before leaving your device. Even Telegram cannot read them.
                  </p>
                </div>
              </div>

              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Rotate encryption key? Old files cannot be decrypted without the old key.')) {
                    toast.error('Key rotation not implemented yet')
                  }
                }}
              >
                Rotate Encryption Key
              </Button>
            </div>
          </div>
        )}

        {/* ── Sync Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'sync' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-teal-400" />
                <h3 className="font-semibold text-gray-100">Sync Settings</h3>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-800/50 p-3">
                <p className="text-xs text-gray-500">Last synced</p>
                <p className="text-sm font-medium text-gray-200 mt-0.5">
                  {formatSyncTime(status?.lastPush)}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">
                  Auto-sync interval
                </label>
                <select
                  value={autoSync}
                  onChange={(e) => handleAutoSyncChange(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="0">Off</option>
                  <option value="300000">Every 5 minutes</option>
                  <option value="900000">Every 15 minutes</option>
                  <option value="3600000">Every hour</option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={isSyncing}
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => push().catch((e) => toast.error(e.message))}
                >
                  Sync Now
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={isSyncing}
                  onClick={() => pull().catch((e) => toast.error(e.message))}
                >
                  Pull Index
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
