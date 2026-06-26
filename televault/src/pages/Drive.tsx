import { useEffect, useCallback, useState } from 'react'
import { Sidebar } from '../components/layout/Sidebar'
import { Toolbar } from '../components/layout/Toolbar'
import { StatusBar } from '../components/layout/StatusBar'
import { FileGrid } from '../components/files/FileGrid'
import { FileList } from '../components/files/FileList'
import { FilePreview } from '../components/files/FilePreview'
import { DropZone } from '../components/upload/DropZone'
import { UploadQueue } from '../components/upload/UploadQueue'
import { DownloadQueue } from '../components/download/DownloadQueue'
import { Spinner } from '../components/shared/Spinner'
import { useFilesStore } from '../store/files.store'
import { useTreeStore } from '../store/tree.store'
import { useUIStore } from '../store/ui.store'
import { useUpload } from '../hooks/useUpload'
import { useDownloadListener } from '../hooks/useDownload'
import { useSearch } from '../hooks/useSearch'
import { MoveToModal } from '../components/folders/MoveToModal'

export default function Drive() {
  const currentPath = useFilesStore((s) => s.currentPath)
  const isLoading = useFilesStore((s) => s.isLoading)
  const loadFolder = useFilesStore((s) => s.loadFolder)
  const entries = useFilesStore((s) => s.entries)
  const clearSelection = useFilesStore((s) => s.clearSelection)
  const selectedIds = useFilesStore((s) => s.selectedIds)
  const loadTree = useTreeStore((s) => s.loadTree)
  const expandPath = useTreeStore((s) => s.expandPath)
  const viewMode = useUIStore((s) => s.viewMode)
  const searchQuery = useUIStore((s) => s.searchQuery)
  const setSearchQuery = useUIStore((s) => s.setSearchQuery)
  const previewEntryId = useUIStore((s) => s.previewEntryId)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)
  const { results: searchResults } = useSearch(searchQuery)

  // Channel setup state
  const [channelBanner, setChannelBanner] = useState<'checking' | 'initializing' | 'error' | null>(null)
  const [channelError, setChannelError] = useState<string | null>(null)

  useUpload()
  useDownloadListener()

  useEffect(() => {
    loadTree()
    loadFolder('/')

      // Check if Telegram channels are set up; auto-initialize if missing
      ; (async () => {
        try {
          setChannelBanner('checking')
          const status = await window.televault.system.getChannelStatus()
          if (status.ok && !status.data?.ready) {
            setChannelBanner('initializing')
            const result = await window.televault.system.initializeChannels()
            if (result.ok) {
              setChannelBanner(null) // success — hide banner
            } else {
              setChannelError(result.error ?? 'Could not set up storage channels')
              setChannelBanner('error')
            }
          } else {
            setChannelBanner(null) // already ready
          }
        } catch (err) {
          console.error('[Drive] channel check error:', err)
          setChannelBanner(null) // fail silently, upload will retry
        }
      })()
  }, [loadTree, loadFolder])

  useEffect(() => {
    if (!searchQuery) {
      loadFolder(currentPath)
      expandPath(currentPath)
    }
  }, [currentPath, loadFolder, expandPath, searchQuery])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape: clear selection, close modals/search
      if (e.key === 'Escape') {
        clearSelection()
        setPreviewEntryId(null)
        if (searchQuery) setSearchQuery('')
      }
      // Ctrl/Cmd+A: select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        const toSelect = displayEntries.map((e) => e.id)
        if (toSelect.length > 0) {
          useFilesStore.getState().selectFile(toSelect[0], false)
          useFilesStore.getState().selectFile(toSelect[toSelect.length - 1], true, toSelect)
        }
      }
      // Delete/Backspace: delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && !previewEntryId) {
        const ids = Array.from(selectedIds)
        if (confirm(`Delete ${ids.length} file(s)? They will be moved to trash.`)) {
          Promise.all(ids.map((id) => window.televault.files.delete(id, false))).then(() => {
            clearSelection()
            loadFolder(currentPath)
          })
        }
      }
    },
    [clearSelection, setPreviewEntryId, searchQuery, setSearchQuery, selectedIds, previewEntryId, currentPath, loadFolder]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const displayEntries = searchQuery.length > 1 ? searchResults : entries
  const previewEntry = displayEntries.find((e) => e.id === previewEntryId) ?? null

  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />

        {/* Channel setup banner */}
        {channelBanner === 'initializing' && (
          <div className="flex items-center gap-3 border-b border-amber-800/40 bg-amber-950/40 px-4 py-2.5 text-sm">
            <Spinner size="sm" />
            <span className="text-amber-300">
              Setting up your TeleVault storage on Telegram — this takes a few seconds…
            </span>
          </div>
        )}
        {channelBanner === 'error' && (
          <div className="flex items-center justify-between border-b border-red-800/40 bg-red-950/40 px-4 py-2.5 text-sm">
            <span className="text-red-300">{channelError}</span>
            <button
              className="text-xs text-red-400 hover:text-red-200 underline"
              onClick={() => setChannelBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        <main className="relative flex-1 overflow-hidden">
          {isLoading && searchQuery.length <= 1 ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {searchQuery.length > 1 && (
                <div className="border-b border-gray-800 px-4 py-2 text-xs text-gray-500 flex items-center gap-2">
                  <span className="text-violet-400 font-medium">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </span>
                  <span>for</span>
                  <span className="text-gray-300">"{searchQuery}"</span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="ml-auto text-gray-600 hover:text-gray-300 transition-colors text-xs"
                  >
                    Clear search
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                {viewMode === 'grid' ? (
                  <FileGrid entries={displayEntries} />
                ) : (
                  <FileList entries={displayEntries} />
                )}
              </div>
            </div>
          )}

          <DropZone />
        </main>

        <StatusBar />
      </div>

      <UploadQueue />
      <DownloadQueue />

      <FilePreview
        entry={previewEntry}
        onClose={() => setPreviewEntryId(null)}
      />

      <MoveToModal />
    </div>
  )
}
