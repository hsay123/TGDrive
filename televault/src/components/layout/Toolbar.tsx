import { useState, useRef, useEffect } from 'react'
import {
  Upload,
  LayoutGrid,
  List,
  Search,
  FolderPlus,
  ChevronRight,
  RefreshCw,
  Check,
  X,
} from 'lucide-react'
import { Button } from '../shared/Button'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'
import { useUploadStore } from '../../store/upload.store'
import { useSync } from '../../hooks/useSync'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export function Toolbar() {
  const currentPath = useFilesStore((s) => s.currentPath)
  const currentView = useFilesStore((s) => s.currentView)
  const setPath = useFilesStore((s) => s.setPath)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const viewMode = useUIStore((s) => s.viewMode)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const openModal = useUIStore((s) => s.openModal)
  const addToQueue = useUploadStore((s) => s.addToQueue)
  const { isSyncing, push } = useSync()

  const [searchOpen, setSearchOpen] = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Build breadcrumbs
  const breadcrumbs = currentPath.split('/').filter(Boolean)

  // Truncate deep paths
  const displayCrumbs =
    breadcrumbs.length > 4
      ? [null, ...breadcrumbs.slice(-2)]
      : breadcrumbs

  const handleUpload = async () => {
    const result = await window.televault.system.openFilePicker()
    if (!result.success || !result.data?.length) {
      if (result.error) toast.error(result.error)
      return
    }
    addToQueue(
      result.data.map((f) => ({
        name: f.path.split('/').pop() ?? f.path,
        localPath: f.path,
        size: f.size,
      })),
      currentPath,
      false
    )
  }

  const handleSync = async () => {
    try {
      await push()
      setSyncDone(true)
      setTimeout(() => setSyncDone(false), 2000)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus()
    }
  }, [searchOpen])

  // Keyboard shortcut: Cmd/Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-4 py-2.5 h-[52px]">
      {/* Breadcrumb */}
      <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm text-gray-400 overflow-hidden">
        <button
          className="hover:text-gray-200 transition-colors duration-150 whitespace-nowrap flex-shrink-0"
          onClick={() => setPath('/')}
        >
          All Files
        </button>
        {currentView === 'recent' && (
          <span className="flex items-center gap-1 flex-shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
            <span className="font-medium text-gray-200">Recent</span>
          </span>
        )}
        {currentView === 'starred' && (
          <span className="flex items-center gap-1 flex-shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
            <span className="font-medium text-gray-200">Starred</span>
          </span>
        )}
        {currentView === 'trash' && (
          <span className="flex items-center gap-1 flex-shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
            <span className="font-medium text-gray-200">Trash</span>
          </span>
        )}
        {currentView === 'drive' && (
          <>
            {breadcrumbs.length > 4 && (
              <span className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                <span className="text-gray-600">…</span>
              </span>
            )}
            {displayCrumbs.map((crumb, i) => {
              if (crumb === null) return null
              const allCrumbs = breadcrumbs
              const visibleStart = breadcrumbs.length > 4 ? breadcrumbs.length - 2 : 0
              const idx = visibleStart + i - (breadcrumbs.length > 4 ? 1 : 0)
              const path = '/' + allCrumbs.slice(0, idx + 1).join('/')
              const isLast = i === displayCrumbs.filter(Boolean).length - 1 + (breadcrumbs.length > 4 ? 1 : 0)
              return (
                <span key={path} className="flex items-center gap-1 min-w-0 flex-shrink-0">
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                  {isLast ? (
                    <span className="truncate font-medium text-gray-200 max-w-[120px]">{crumb}</span>
                  ) : (
                    <button
                      className="truncate hover:text-gray-200 transition-colors duration-150 max-w-[100px]"
                      onClick={() => setPath(path)}
                    >
                      {crumb}
                    </button>
                  )}
                </span>
              )
            })}
          </>
        )}
      </nav>

      {/* Right side actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Search */}
        <div className="relative flex items-center">
          {searchOpen ? (
            <div className="flex items-center gap-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search files…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={() => {
                    if (!searchQuery) setSearchOpen(false)
                  }}
                  className="w-48 rounded-md border border-gray-700 bg-gray-800 py-1.5 pl-8 pr-3 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all duration-200"
                />
              </div>
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchOpen(false) }}
                  className="rounded-md p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors duration-150"
              title="Search (⌘F)"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex rounded-md border border-gray-700 overflow-hidden">
          <button
            className={clsx(
              'p-1.5 transition-colors duration-150',
              viewMode === 'grid'
                ? 'bg-gray-700 text-violet-400'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            )}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            className={clsx(
              'p-1.5 transition-colors duration-150',
              viewMode === 'list'
                ? 'bg-gray-700 text-violet-400'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            )}
            onClick={() => setViewMode('list')}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* New folder */}
        <button
          onClick={() => openModal('new-folder')}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors duration-150"
          title="New folder"
        >
          <FolderPlus className="h-4 w-4" />
          New
        </button>

        {/* Upload */}
        <Button
          variant="primary"
          size="sm"
          icon={<Upload className="h-3.5 w-3.5" />}
          onClick={handleUpload}
        >
          Upload
        </Button>

        {/* Sync indicator */}
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={clsx(
            'rounded-md p-1.5 transition-colors duration-150',
            isSyncing
              ? 'text-violet-400 cursor-not-allowed'
              : syncDone
              ? 'text-teal-400'
              : 'text-gray-500 hover:bg-gray-800 hover:text-gray-200'
          )}
          title="Sync now"
        >
          {syncDone ? (
            <Check className="h-4 w-4" />
          ) : (
            <RefreshCw className={clsx('h-4 w-4', isSyncing && 'animate-spin')} />
          )}
        </button>
      </div>
    </div>
  )
}
