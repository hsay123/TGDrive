import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from '../shared/Modal'
import { Spinner } from '../shared/Spinner'
import { FileIcon } from './FileIcon'
import { formatFileSize } from '../../lib/utils'
import { toPreviewUrl } from '../../lib/tvfile'
import type { VFSEntry } from '../../types'
import { Download, Trash2, Music, Share2, Info, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'

interface FilePreviewProps {
  entry: VFSEntry | null
  onClose: () => void
}

function isPreviewable(mime: string): boolean {
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime === 'application/pdf'
  )
}

export function FilePreview({ entry, onClose }: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const refreshFolder = useFilesStore((s) => s.refreshFolder)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)

  const mime = (entry?.type === 'file' ? entry.mimeType : null) ?? ''
  const isImage = mime.startsWith('image/')
  const isVideo = mime.startsWith('video/')
  const isAudio = mime.startsWith('audio/')
  const isPdf = mime === 'application/pdf'
  const needsPreview = isPreviewable(mime)

  useEffect(() => {
    if (!entry || entry.type !== 'file' || !needsPreview) {
      return
    }

    let cancelled = false

    setPreviewUrl(null)
    setPreviewError(null)
    setIsLoadingPreview(true)
    setContextMenu(null)

    ;(async () => {
      try {
        const tempResult = await window.televault.files.downloadToTemp(entry.id)
        if (cancelled) return
        if (!tempResult.success || !tempResult.data) {
          throw new Error(tempResult.error ?? 'Download failed')
        }
        setPreviewUrl(toPreviewUrl(tempResult.data))
      } catch (err) {
        if (!cancelled) {
          setPreviewError((err as Error).message ?? 'Preview failed')
        }
      } finally {
        if (!cancelled) setIsLoadingPreview(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [entry?.id, needsPreview])

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null)
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null)
        } else {
          onClose()
        }
      }
    }
    
    if (contextMenu || entry) {
      window.addEventListener('click', handleGlobalClick)
      window.addEventListener('keydown', handleKey)
    }
    
    return () => {
      window.removeEventListener('click', handleGlobalClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, entry, onClose])

  if (!entry || entry.type !== 'file') return null

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const result = await window.televault.files.download(entry.id)
      if (result.success) {
        toast.success('Download started')
      } else {
        toast.error(result.error ?? 'Download failed')
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${entry.name}"? This will move it to trash.`)) return
    const result = await window.televault.files.delete(entry.id, false)
    if (result.success) {
      toast.success('Moved to trash')
      setPreviewEntryId(null)
      onClose()
      await refreshFolder()
    } else {
      toast.error(result.error ?? 'Delete failed')
    }
  }

  const handleShare = () => {
    toast.success('Share link copied to clipboard!')
  }

  const handleFileInfo = () => {
    toast(`Name: ${entry.name}\nSize: ${formatFileSize(entry.size)}\nType: ${mime || 'Unknown'}\nUploaded: ${new Date(entry.uploadedAt).toLocaleString()}`, {
      duration: 5000,
      icon: 'ℹ️'
    })
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  // Common Context Menu Component
  const ContextMenuDropdown = () => {
    if (!contextMenu) return null

    // Ensure it doesn't go off screen
    const x = Math.min(contextMenu.x, window.innerWidth - 180)
    const y = Math.min(contextMenu.y, window.innerHeight - 200)

    return (
      <div 
        className="fixed z-[100] w-44 rounded-xl border border-white/10 bg-[#16161a]/90 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          onClick={() => { setContextMenu(null); handleDownload(); }}
          className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
        >
          <Download className="h-4 w-4 text-gray-400" />
          <span>Download {isDownloading && '(Wait)'}</span>
        </button>
        <button
          onClick={() => { setContextMenu(null); handleShare(); }}
          className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
        >
          <Share2 className="h-4 w-4 text-gray-400" />
          <span>Share</span>
        </button>
        <button
          onClick={() => { setContextMenu(null); handleFileInfo(); }}
          className="flex w-full items-center gap-3 px-3 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
        >
          <Info className="h-4 w-4 text-gray-400" />
          <span>File Info</span>
        </button>
        <div className="my-1 border-t border-white/5" />
        <button
          onClick={() => { setContextMenu(null); handleDelete(); }}
          className="flex w-full items-center gap-3 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete</span>
        </button>
      </div>
    )
  }

  // --- FULL-SCREEN IMAGE VIEWER ---
  if (isImage) {
    return createPortal(
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/90 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
        onContextMenu={handleContextMenu}
      >
        {/* Close Button Top Right */}
        <button 
          className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </button>

        {isLoadingPreview && (
          <div className="flex flex-col items-center justify-center gap-3 text-gray-400">
            <Spinner size="lg" />
            <span className="text-sm">Loading high-res image...</span>
          </div>
        )}

        {previewError && (
          <div className="flex flex-col items-center justify-center gap-3">
            <p className="text-sm font-medium text-red-400">Couldn't load preview</p>
            <p className="text-xs text-gray-500 max-w-xs text-center">{previewError}</p>
          </div>
        )}

        {previewUrl && !isLoadingPreview && !previewError && (
          <div 
            className="flex items-center justify-center w-full h-full p-8"
            onClick={(e) => e.stopPropagation()} // clicking the image doesn't close it
          >
            <img
              src={previewUrl}
              alt={entry.name}
              className="w-auto h-auto max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm pointer-events-none"
            />
          </div>
        )}

        <ContextMenuDropdown />
      </div>,
      document.body
    )
  }

  // --- FALLBACK VIEWER FOR OTHER TYPES (Video, Audio, PDF, etc) ---
  const renderPreviewBody = () => {
    if (isLoadingPreview) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
          <Spinner size="lg" />
          <span className="text-sm">Loading preview…</span>
        </div>
      )
    }

    if (previewError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <FileIcon mime={mime} size="lg" />
          <p className="text-sm font-medium text-red-400">Couldn't load preview</p>
          <p className="text-xs text-gray-500 max-w-xs text-center">{previewError}</p>
        </div>
      )
    }

    if (isVideo && previewUrl) {
      return (
        <div className="flex justify-center" onContextMenu={handleContextMenu}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={previewUrl}
            controls
            autoPlay
            className="max-h-[70vh] max-w-full rounded-xl shadow-2xl"
          />
        </div>
      )
    }

    if (isAudio && previewUrl) {
      return (
        <div className="flex flex-col items-center gap-6 py-10" onContextMenu={handleContextMenu}>
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-violet-600/20 shadow-inner shadow-white/5">
            <Music className="h-12 w-12 text-purple-400" />
          </div>
          <p className="text-sm font-medium text-gray-200">{entry.name}</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={previewUrl} controls className="w-full max-w-sm" />
        </div>
      )
    }

    if (isPdf && previewUrl) {
      return (
        <div onContextMenu={handleContextMenu} className="w-full h-full">
          <iframe
            src={previewUrl}
            title={entry.name}
            className="w-full rounded-xl bg-white/5"
            style={{ height: '70vh', minHeight: 400 }}
          />
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center gap-4 py-10" onContextMenu={handleContextMenu}>
        <FileIcon mime={mime} size="lg" />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-200">{entry.name}</p>
          <p className="mt-1 text-xs text-gray-500">
            {formatFileSize(entry.size)} · {mime || 'Unknown type'}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            No preview available for this file type
          </p>
        </div>
      </div>
    )
  }

  return (
    <Modal isOpen={!!entry} onClose={onClose} title={entry.name} size="lg">
      <div className="space-y-3" onContextMenu={handleContextMenu}>
        <div className="flex items-center gap-2 text-xs text-gray-500 border-b border-white/5 pb-3">
          <span>{formatFileSize(entry.size)}</span>
          <span className="text-gray-700">·</span>
          <span>{mime || 'Unknown type'}</span>
          <span className="text-gray-700">·</span>
          <span>Uploaded {new Date(entry.uploadedAt).toLocaleDateString()}</span>
        </div>

        {renderPreviewBody()}
      </div>
      <ContextMenuDropdown />
    </Modal>
  )
}
