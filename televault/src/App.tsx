import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Cloud } from 'lucide-react'
import { ToastProvider } from './components/shared/Toast'
import { AppInit } from './components/AppInit'
import { isTelevaultAvailable } from './lib/electron'
import Login from './pages/Login'
import Drive from './pages/Drive'
import Settings from './pages/Settings'
import Setup from './pages/Setup'

/**
 * App.tsx — pure router shell.
 * Zero state, zero useEffects, zero route guards based on credentials.
 *
 * Routing logic lives in <AppInit> which is mounted ONLY at "/".
 * All other routes are completely standalone pages.
 */

// Not-in-Electron splash
function BrowserSplash() {
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
          and use the TeleVault window that opens.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isTelevaultAvailable()) {
    return <BrowserSplash />
  }

  return (
    <BrowserRouter>
      <ToastProvider />
      <Routes>
        {/* Entry point — AppInit decides where to send the user, runs once */}
        <Route path="/" element={<AppInit />} />

        {/* Standalone pages — no credential guards, no re-init */}
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/drive" element={<Drive />} />
        <Route path="/settings" element={<Settings />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
