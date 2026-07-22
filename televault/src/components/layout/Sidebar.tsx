import { Link, useLocation } from 'react-router-dom'
import { Settings, HardDrive, Clock, Star, Trash2 } from 'lucide-react'
import { FolderTree } from '../folders/FolderTree'
import blackLogo from '../../assets/blacklogo.png'
import whiteLogo from '../../assets/whittelogo.png'
import { UserAvatar } from '../shared/UserAvatar'
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

  return (
    <aside
      className="relative z-10 flex w-60 flex-shrink-0 flex-col backdrop-blur-md"
      style={{ background: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo */}
      <div className="flex items-center px-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <Link to="/" className="relative flex items-center w-full h-20 overflow-hidden">
          {/* Light Mode Logo: Visible by default, hidden in dark mode */}
          <img
            src={blackLogo}
            alt="TeleVault"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[12rem] h-auto max-w-none block dark:hidden"
          />
          {/* Dark Mode Logo: Hidden by default, visible in dark mode */}
          <img
            src={whiteLogo}
            alt="TeleVault"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[12rem] h-auto max-w-none hidden dark:block"
          />
        </Link>
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
                ? 'bg-purple-100/50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 font-medium'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-black/5 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-white/[0.02]'
            )}
          >
            {active && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-purple-500 dark:bg-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.4)]" />
            )}
            <Icon className={clsx("h-4 w-4 flex-shrink-0", active ? "text-purple-600 dark:text-purple-400" : "")} />
            {label}
          </button>
        ))}
      </nav>

      <div className="my-2 mx-4" style={{ borderTop: '1px solid var(--border)' }} />

      {/* Folders / Tags pill toggle */}
      <div className="mx-3 mt-3 mb-2 grid grid-cols-2 p-[3px] rounded-[10px] bg-black/5 dark:bg-white/[0.06]">
        {(['folders', 'tags'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSidebarTab(tab)}
            className={clsx(
              "py-1.5 rounded-lg text-[13px] font-semibold transition-all duration-200 cursor-pointer border-none",
              sidebarTab === tab
                ? "bg-white text-neutral-900 shadow-sm dark:bg-white/10 dark:text-white"
                : "text-neutral-500 hover:text-neutral-900 bg-transparent dark:text-neutral-400 dark:hover:text-neutral-100"
            )}
          >
            {tab === 'folders' ? 'Folders' : 'Tags'}
          </button>
        ))}
      </div>

      {/* Folder tree (scrollable) or Tags placeholder */}
      <div className="flex-1 overflow-y-auto">
        {sidebarTab === 'folders' && <FolderTree />}
        {sidebarTab === 'tags' && (
          <div style={{
            padding: '20px 16px', textAlign: 'center',
            fontSize: 13, color: 'var(--muted)'
          }}>
            Tags coming soon
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div className="p-3 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
        {/* Storage bar */}
        <div className="px-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Storage</span>
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
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
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-black/5 dark:hover:bg-gray-800 transition-colors group cursor-default">
          <UserAvatar size={28} borderRadius={8} />
          <span className="flex-1 truncate text-sm" style={{ color: 'var(--fg)' }}>
            {user?.firstName ?? 'User'}
          </span>
          <Link
            to="/settings"
            className="text-neutral-400 hover:text-neutral-600 dark:text-gray-500 dark:hover:text-gray-200 transition-colors opacity-0 group-hover:opacity-100"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </aside>
  )
}
