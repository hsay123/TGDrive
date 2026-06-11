import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Phone, Shield, ArrowLeft, ChevronDown } from 'lucide-react'
import { Button } from '../components/shared/Button'
import { Input } from '../components/shared/Input'
import { useAuthStore } from '../store/auth.store'

type Step = 'phone' | 'otp' | '2fa'

const COUNTRY_CODES = [
  { code: 'IN', dial: '+91', flag: '🇮🇳', name: 'India' },
  { code: 'US', dial: '+1', flag: '🇺🇸', name: 'USA' },
  { code: 'GB', dial: '+44', flag: '🇬🇧', name: 'UK' },
  { code: 'DE', dial: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: 'FR', dial: '+33', flag: '🇫🇷', name: 'France' },
  { code: 'JP', dial: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: 'AU', dial: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: 'CA', dial: '+1', flag: '🇨🇦', name: 'Canada' },
  { code: 'SG', dial: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'UAE' },
]

const RESEND_TIMEOUT = 30

export default function Login() {
  const navigate = useNavigate()
  const setLoggedIn = useAuthStore((s) => s.setLoggedIn)
  const [step, setStep] = useState<Step>('phone')
  const [dialCode, setDialCode] = useState('+91')
  const [phone, setPhone] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [isCodeViaApp, setIsCodeViaApp] = useState(true)
  const [otp, setOtp] = useState(['', '', '', '', ''])
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendTimer, setResendTimer] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fullPhone = `${dialCode}${phone.replace(/\D/g, '')}`

  const startResendTimer = () => {
    setResendTimer(RESEND_TIMEOUT)
    resendIntervalRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(resendIntervalRef.current!)
          return 0
        }
        return t - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current)
    }
  }, [])

  const handleSendCode = async () => {
    if (!phone.trim()) {
      setError('Enter your phone number')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await window.televault!.auth.sendCode(fullPhone)
      if (!result.success) throw new Error(result.error)
      setPhoneCodeHash(result.data!.phoneCodeHash)
      setIsCodeViaApp(result.data!.isCodeViaApp)
      setStep('otp')
      startResendTimer()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async (forceSMS = false) => {
    if (resendTimer > 0) return
    setLoading(true)
    try {
      const result = await window.televault!.auth.resendCode(fullPhone, phoneCodeHash, forceSMS)
      if (!result.success) throw new Error(result.error)
      setPhoneCodeHash(result.data!.phoneCodeHash)
      setIsCodeViaApp(result.data!.isCodeViaApp)
      setOtp(['', '', '', '', ''])
      setError('')
      startResendTimer()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    const code = otp.join('')
    if (code.length < 5) {
      setError('Enter all 5 digits')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await window.televault.auth.signIn(fullPhone, phoneCodeHash, code)
      if (!result.success) {
        if (result.error?.includes('2FA') || result.error?.includes('SESSION_PASSWORD_NEEDED')) {
          setStep('2fa')
          return
        }
        throw new Error(result.error)
      }
      setLoggedIn({
        id: result.data!.user.id,
        firstName: result.data!.user.firstName,
        username: result.data!.user.username || null,
      })
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed'
      if (msg.includes('2FA') || msg.includes('SESSION_PASSWORD_NEEDED')) {
        setStep('2fa')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handle2FA = async () => {
    if (!password) {
      setError('Enter your Telegram password')
      return
    }
    setError('')
    setLoading(true)
    try {
      const result = await window.televault.auth.check2FA(password)
      if (!result.success) throw new Error(result.error)
      setLoggedIn({
        id: result.data!.user.id,
        firstName: result.data!.user.firstName,
        username: result.data!.user.username || null,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong password')
    } finally {
      setLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const next = [...otp]
    next[index] = value.slice(-1)
    setOtp(next)
    if (value && index < 4) {
      otpRefs.current[index + 1]?.focus()
    }
    // Auto-submit when all filled
    if (next.every(Boolean) && next.join('').length === 5) {
      setTimeout(() => handleVerifyOtp(), 100)
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpRefs.current[0]?.focus(), 50)
    }
  }, [step])

  const stepDots = ['phone', 'otp', '2fa']

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-950 p-4 overflow-hidden">
      {/* Background gradient */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 shadow-lg shadow-violet-600/30">
            <Zap className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-100">TeleVault</h1>
          <p className="mt-1 text-sm text-gray-500">Your Telegram, your drive</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
          {/* Step 1: Phone */}
          {step === 'phone' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-200">Enter your phone number</h2>

              {/* Country selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Country</label>
                <div className="relative">
                  <select
                    value={dialCode}
                    onChange={(e) => setDialCode(e.target.value)}
                    className="w-full appearance-none rounded-md border border-gray-700 bg-gray-900 px-3 py-2 pr-8 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={`${c.code}-${c.dial}`} value={c.dial}>
                        {c.flag} {c.name} ({c.dial})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                </div>
              </div>

              <Input
                label="Phone number"
                icon={<Phone className="h-4 w-4" />}
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, ''))
                  setError('')
                }}
                placeholder="9876543210"
                maxLength={15}
                onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
              />

              {error && <p className="text-xs text-red-400">{error}</p>}

              <Button fullWidth loading={loading} onClick={handleSendCode}>
                Send Code
              </Button>

              <p className="text-center text-xs text-gray-600">
                We'll send a code via Telegram
              </p>
            </div>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setStep('phone'); setOtp(['', '', '', '', '']); setError('') }}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-semibold text-gray-200">Enter the 5-digit code</h2>
              </div>

              {isCodeViaApp ? (
                <div className="rounded-lg border border-violet-500/20 bg-violet-600/5 p-3 text-xs text-gray-400">
                  <p className="font-medium text-violet-300">Check your Telegram app</p>
                  <p className="mt-0.5">
                    Look for a message from <span className="text-gray-200">Telegram</span> on the device linked to {fullPhone}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  SMS code sent to <span className="text-gray-300">{fullPhone}</span>
                </p>
              )}

              {/* OTP boxes */}
              <div className="flex justify-center gap-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (otpRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="h-12 w-10 rounded-lg border border-gray-700 bg-gray-800 text-center text-lg font-bold text-gray-100 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                  />
                ))}
              </div>

              {error && <p className="text-xs text-red-400 text-center">{error}</p>}

              <Button fullWidth loading={loading} onClick={handleVerifyOtp}>
                Verify Code
              </Button>

              <div className="flex flex-col gap-1.5 text-center">
                <button
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
                  disabled={resendTimer > 0 || loading}
                  onClick={() => handleResendCode(false)}
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 2FA */}
          {step === '2fa' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setStep('otp'); setError('') }}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-semibold text-gray-200">Two-factor authentication</h2>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                <Shield className="h-5 w-5 text-violet-400 flex-shrink-0" />
                <p className="text-xs text-gray-400">
                  Your account has 2FA enabled. Enter your Telegram password.
                </p>
              </div>

              <div>
                <Input
                  label="Telegram password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  placeholder="Your password"
                  onKeyDown={(e) => e.key === 'Enter' && handle2FA()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="mt-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <Button fullWidth loading={loading} onClick={handle2FA}>
                Continue
              </Button>

              <p className="text-center text-xs text-gray-600">
                Forgot your password?{' '}
                <a
                  href="https://telegram.org/faq#q-how-do-i-recover-my-password"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300"
                >
                  Reset on Telegram
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Step dots */}
        <div className="mt-6 flex justify-center gap-2">
          {stepDots.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === s
                  ? 'w-5 bg-violet-500'
                  : i < stepDots.indexOf(step)
                  ? 'w-1.5 bg-violet-700'
                  : 'w-1.5 bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
