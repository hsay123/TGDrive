import { useNavigate } from 'react-router-dom'
import { Zap, Mail, Key, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useUIStore } from '../../store/ui.store'
import { Button } from './Button'

export function UpgradeModal() {
  const isOpen = useUIStore((s) => s.showUpgradeModal)
  const closeUpgradeModal = useUIStore((s) => s.closeUpgradeModal)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUpgradeModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, closeUpgradeModal])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={closeUpgradeModal}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20">
              <Zap className="h-4 w-4 text-violet-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-100">Upgrade to TeleVault Pro</h2>
          </div>
          <button
            onClick={closeUpgradeModal}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-700 hover:text-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-300">
            Get end-to-end encryption, cross-device sync, and file version history.
          </p>

          <div className="rounded-lg border border-violet-500/20 bg-violet-600/5 p-4 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-violet-400">
              Pro is currently invite-only
            </p>
            <p className="text-sm text-gray-300">
              Contact us to get access or request an invite:
            </p>
            <a
              href="mailto:hello@televault.app"
              className="flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200 transition-colors"
            >
              <Mail className="h-4 w-4" />
              hello@televault.app
            </a>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Key className="h-4 w-4 text-gray-500" />
              <span>Already have a license key?</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Enter it in Settings → License to activate Pro features.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-700 px-5 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              closeUpgradeModal()
              navigate('/upgrade')
            }}
          >
            View all features
          </Button>
          <Button variant="secondary" size="sm" onClick={closeUpgradeModal}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
