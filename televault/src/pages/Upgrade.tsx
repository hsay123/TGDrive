import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, X, Zap, Mail, Key } from 'lucide-react'
import { Button } from '../components/shared/Button'
import { useLicense } from '../hooks/useLicense'
import toast from 'react-hot-toast'


const FEATURES = [
  { label: 'Upload & download files', free: true, pro: true, team: true },
  { label: 'Nested folder structure', free: true, pro: true, team: true },
  { label: '1 device', free: true, pro: false, team: false },
  { label: 'Up to 3 devices', free: false, pro: true, team: false },
  { label: 'Unlimited devices', free: false, pro: false, team: true },
  { label: 'AES-256 encryption', free: false, pro: true, team: true },
  { label: 'Cross-device sync', free: false, pro: true, team: true },
  { label: 'File version history', free: false, pro: true, team: true },
  { label: 'Team workspaces', free: false, pro: false, team: true },
  { label: 'Priority support', free: false, pro: true, team: true },
]

function Cell({ value }: { value: boolean }) {
  return (
    <td className="px-4 py-3 text-center">
      {value ? (
        <Check className="mx-auto h-4 w-4 text-teal-400" />
      ) : (
        <X className="mx-auto h-4 w-4 text-gray-700" />
      )}
    </td>
  )
}

export default function Upgrade() {
  const { tier } = useLicense()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      toast.error('Enter a valid email address')
      return
    }
    setSubmitting(true)
    // Simulate saving to local waitlist
    await new Promise((r) => setTimeout(r, 600))
    setSubmitting(false)
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Drive
        </Link>

        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/20">
            <Zap className="h-7 w-7 text-violet-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-100">TeleVault Pro — Coming Soon</h1>
          <p className="mt-2 text-gray-400">
            We're rolling out Pro access invite-by-invite. Join the waitlist to be notified.
          </p>
        </div>

        {/* Feature comparison table */}
        <div className="mb-10 overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 py-3 text-left font-medium text-gray-400">Feature</th>
                <th className="px-4 py-3 text-center font-medium text-gray-400">Free</th>
                <th className="px-4 py-3 text-center font-medium text-violet-300">Pro</th>
                <th className="px-4 py-3 text-center font-medium text-teal-300">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {FEATURES.map((feature) => (
                <tr
                  key={feature.label}
                  className="transition-colors hover:bg-gray-800/30"
                >
                  <td className="px-4 py-3 text-gray-300">{feature.label}</td>
                  <Cell value={feature.free} />
                  <Cell value={feature.pro} />
                  <Cell value={feature.team} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Waitlist form */}
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
            <h2 className="mb-1 text-base font-semibold text-gray-100">Join the waitlist</h2>
            <p className="mb-4 text-sm text-gray-400">
              Be the first to know when Pro launches.
            </p>

            {submitted ? (
              <div className="flex items-center gap-3 rounded-lg border border-teal-700/30 bg-teal-600/5 p-4">
                <Check className="h-5 w-5 text-teal-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-teal-300">You're on the list!</p>
                  <p className="text-xs text-gray-500">
                    We'll email you when Pro launches.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-3">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  required
                />
                <Button fullWidth type="submit" loading={submitting} icon={<Mail className="h-4 w-4" />}>
                  Notify me when Pro launches
                </Button>
              </form>
            )}
          </div>

          {/* License key & contact */}
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-4 w-4 text-gray-500" />
                <p className="text-sm font-medium text-gray-200">Already have a license key?</p>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Enter it in Settings → License to activate Pro features immediately.
              </p>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => navigate('/settings')}
              >
                Go to Settings → License
              </Button>
            </div>

            <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <p className="text-sm font-medium text-gray-200">Questions?</p>
              </div>
              <a
                href="mailto:hello@televault.app"
                className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
              >
                hello@televault.app
              </a>
              <p className="mt-1 text-xs text-gray-600">
                We respond within 24 hours.
              </p>
            </div>
          </div>
        </div>

        {/* Current plan note */}
        {tier !== 'free' && (
          <div className="mt-8 rounded-xl border border-teal-700/20 bg-teal-600/5 p-4 text-center">
            <p className="text-sm text-teal-300">
              ✓ You're on the <span className="font-semibold capitalize">{tier}</span> plan — you already have access to all Pro features!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
