import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Cloud } from 'lucide-react'
import { ToastProvider } from './components/shared/Toast'
import { Spinner } from './components/shared/Spinner'
import { useAuthStore } from './store/auth.store'
import { isTelevaultAvailable } from './lib/electron'
import Login from './pages/Login'
import Drive from './pages/Drive'
import Settings from './pages/Settings'
import Upgrade from './pages/Upgrade'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  if (isLoggedIn) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export default function App() {
  const isLoading = useAuthStore((s) => s.isLoading)
  const checkSession = useAuthStore((s) => s.checkSession)

  useEffect(() => {
    checkSession()
  }, [checkSession])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!isTelevaultAvailable()) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/20">
            <Cloud className="h-7 w-7 text-violet-400" />
          </div>
          <h1 className="text-xl font-semibold text-white">Open TeleVault in the desktop app</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-400">
            This page was opened in a web browser. TeleVault needs the Electron desktop
            window to talk to Telegram and your local files.
          </p>
          <p className="mt-4 text-sm text-gray-500">
            Run <code className="rounded bg-gray-900 px-1.5 py-0.5 text-violet-300">npm run dev</code>{' '}
            and use the TeleVault window that opens — not{' '}
            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-gray-300">localhost:5173</code>{' '}
            in Chrome or Firefox.
          </p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <ToastProvider />
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Drive />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/upgrade"
          element={
            <ProtectedRoute>
              <Upgrade />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
