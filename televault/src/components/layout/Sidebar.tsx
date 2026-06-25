import { Link, useLocation } from 'react-router-dom'
import { Settings, HardDrive, Clock, Star, Trash2, Zap } from 'lucide-react'
import { FolderTree } from '../folders/FolderTree'
import { useAuthStore } from '../../store/auth.store'
import { useFilesStore } from '../../store/files.store'
import clsx from 'clsx'

export function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const currentView = useFilesStore((s) => s.currentView)
  const setPath = useFilesStore((s) => s.setPath)
  const setTrashView = useFilesStore((s) => s.setTrashView)
  const loadRecent = useFilesStore((s) => s.loadRecent)
  const loadStarred = useFilesStore((s) => s.loadStarred)

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
    <aside className="flex w-60 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-900">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-gray-800 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-bold text-gray-100 tracking-tight">TeleVault</span>
      </div>

      {/* Primary nav */}
      <nav className="px-2 pt-3 pb-1 space-y-0.5">
        {navItems.map(({ id, label, Icon, active, onClick }) => (
          <button
            key={id}
            onClick={onClick}
            className={clsx(
              'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150',
              active
                ? 'bg-violet-600/20 text-violet-400 font-medium'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      <div className="my-2 mx-3 border-t border-gray-800" />

      {/* MY DRIVE section */}
      <div className="px-4 mb-1">
        <span className="text-xs font-medium uppercase tracking-widest text-gray-500">
          My Drive
        </span>
      </div>

      {/* Folder tree (scrollable) */}
      <div className="flex-1 overflow-y-auto">
        <FolderTree />
      </div>

      {/* Bottom section */}
      <div className="border-t border-gray-800 p-3 space-y-3">
        {/* Storage bar */}
        <div className="px-2">
          <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
            <span>Storage</span>
            <span>Telegram</span>
          </div>
          <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-300"
              style={{ width: '24%' }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-600">Unlimited via Telegram</p>
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
