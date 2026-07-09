import { Link, useLocation } from 'react-router-dom'
import { Settings, HardDrive, Clock, Star, Trash2, Zap } from 'lucide-react'
import { FolderTree } from '../folders/FolderTree'
import { useAuthStore } from '../../store/auth.store'
import { useFilesStore } from '../../store/files.store'
import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { STORAGE_LIMIT_BYTES, STORAGE_LIMIT_LABEL } from '../../utils/constants'

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 4).toFixed(2)} TB`
}

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const currentView = useFilesStore((s) => s.currentView)
  const setPath = useFilesStore((s) => s.setPath)
  const setTrashView = useFilesStore((s) => s.setTrashView)
  const loadRecent = useFilesStore((s) => s.loadRecent)
  const loadStarred = useFilesStore((s) => s.loadStarred)
  const entries = useFilesStore((s) => s.entries)

  const [storageUsed, setStorageUsed] = useState(0)
  const [sidebarTab, setSidebarTab] = useState<'folders' | 'tags'>('folders')

  useEffect(() => {
    async function loadStorage() {
      try {
        const result = await window.televault.files.storageUsed()
        if (result.success && result.data) {
          setStorageUsed(result.data.bytes)
        }
      } catch {
        // non-fatal
      }
    }
    loadStorage()
  }, [entries])

  const navItems = [
    {
      id: 'all',
      label: 'All Files',
      Icon: HardDrive,
      active: currentView === 'drive' && location.pathname === '/',
      onClick: () => {
        setTrashView(false)
        setPath('/')
      },
    },
    {
      id: 'recent',
      label: 'Recent',
      Icon: Clock,
      active: currentView === 'recent',
      onClick: () => loadRecent(),
    },
    {
      id: 'starred',
      label: 'Starred',
      Icon: Star,
      active: currentView === 'starred',
      onClick: () => loadStarred(),
    },
    {
      id: 'trash',
      label: 'Trash',
      Icon: Trash2,
      active: currentView === 'trash',
      onClick: async () => {
        setTrashView(true)
        await useFilesStore.getState().refreshFolder()
      },
    },
  ]

  const initials = user?.firstName?.[0]?.toUpperCase() ?? 'U'

  return (
    <aside className="relative z-10 flex w-60 flex-shrink-0 flex-col border-r border-white/5 bg-[#16161a]/80 backdrop-blur-md">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-white/5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-violet-600 shadow-lg shadow-violet-500/20">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-bold text-white tracking-tight">TeleVault</span>
      </div>

      {/* Primary nav */}
      <nav className="px-3 pt-4 pb-2 space-y-1">
        {navItems.map(({ id, label, Icon, active, onClick }) => (
          <button
            key={id}
            onClick={onClick}
            className={clsx(
              'relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
              active
                ? 'bg-white/[0.04] text-white font-medium shadow-inner shadow-white/5'
                : 'text-gray-400 hover:bg-white/[0.02] hover:text-gray-200'
            )}
          >
            {active && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.8)]" />
            )}
            <Icon className={clsx("h-4 w-4 flex-shrink-0", active ? "text-rose-400" : "")} />
            {label}
          </button>
        ))}
      </nav>

      <div className="my-2 mx-4 border-t border-white/5" />

      {/* Folders / Tags pill toggle */}
      <div style={{
        margin: '12px 12px 8px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 3,
      }}>
        {(['folders', 'tags'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSidebarTab(tab)}
            style={{
              padding: '6px 0',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: sidebarTab === tab
                ? 'rgba(255,255,255,0.12)'
                : 'transparent',
              color: sidebarTab === tab
                ? 'rgba(255,255,255,0.90)'
                : 'rgba(255,255,255,0.35)',
              transition: 'all 200ms ease',
            }}
          >
            {tab === 'folders' ? 'Folders' : 'Tags'}
          </button>
        ))}
      </div>

      {/* Folder tree (scrollable) or Tags placeholder */}
      <div className="flex-1 overflow-y-auto">
        {sidebarTab === 'folders' && <FolderTree />}
        {sidebarTab === 'tags' && (
          <div style={{ padding: '20px 16px', textAlign: 'center',
            fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            Tags coming soon
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="border-t border-gray-800 p-3 space-y-3">
        {/* Storage bar */}
        <div className="px-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Storage</span>
            <span className="text-xs text-gray-400 font-medium">
              {formatBytes(storageUsed)}{' '}
              <span className="text-gray-600">of {STORAGE_LIMIT_LABEL}</span>
            </span>
          </div>
          <div className="h-1.5 bg-gray-700/60 rounded-full overflow-hidden">
            {(() => {
              const usedPercent = Math.min((storageUsed / STORAGE_LIMIT_BYTES) * 100, 100)
              return (
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-700 ease-out',
                    usedPercent > 90
                      ? 'bg-red-500'
                      : usedPercent > 70
                      ? 'bg-amber-500'
                      : 'bg-violet-500'
                  )}
                  style={{ width: `${Math.max(usedPercent, 0.5)}%` }}
                />
              )
            })()}
          </div>
          <p className="text-xs text-gray-600">
            {formatBytes(STORAGE_LIMIT_BYTES - storageUsed)} free
          </p>
        </div>

        {/* User row */}
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-gray-800 transition-colors group cursor-default">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <span className="flex-1 truncate text-sm text-gray-300">
            {user?.firstName ?? 'User'}
          </span>
          <Link
            to="/settings"
            className="text-gray-500 hover:text-gray-200 transition-colors opacity-0 group-hover:opacity-100"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </aside>
  )
}
