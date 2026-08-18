import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Lock, X } from 'lucide-react'

interface PinModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  mode: 'set' | 'verify'
}

export function PinModal({ isOpen, onClose, onSuccess, mode }: PinModalProps) {
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setPin('')
      setConfirmPin('')
      setError('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'set') {
        if (pin.length < 4) {
          setError('PIN must be at least 4 digits')
          setLoading(false)
          return
        }
        if (pin !== confirmPin) {
          setError('PINs do not match')
          setLoading(false)
          return
        }
        const result = await window.televault.reveal.setPin(pin)
        if (result.success) {
          onSuccess()
        } else {
          setError(result.error ?? 'Failed to set PIN')
        }
      } else {
        const result = await window.televault.reveal.verify(pin)
        if (result.success && result.data?.ok) {
          onSuccess()
        } else {
          setError('Incorrect PIN')
        }
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1f] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15">
              <Lock className="h-5 w-5 text-purple-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-100">
              {mode === 'set' ? 'Set Reveal PIN' : 'Enter PIN'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">PIN</label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              maxLength={16}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
              placeholder="Enter 4-16 digit PIN"
              autoFocus
            />
          </div>

          {mode === 'set' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={16}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
                placeholder="Re-enter PIN"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Please wait...' : mode === 'set' ? 'Set PIN' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  )
}
