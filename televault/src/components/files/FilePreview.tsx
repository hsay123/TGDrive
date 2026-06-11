import { useState, useEffect, useRef } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { Spinner } from '../shared/Spinner'
import { FileIcon } from './FileIcon'
import { formatFileSize } from '../../lib/utils'
import type { VFSEntry } from '../../types'
import { Download, Trash2, Music } from 'lucide-react'
import toast from 'react-hot-toast'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'
import { GatedFeature } from '../shared/GatedFeature'

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
  const objectUrlRef = useRef<string | null>(null)

  const refreshFolder = useFilesStore((s) => s.refreshFolder)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)

  const mime = (entry?.type === 'file' ? entry.mimeType : null) ?? ''
  const isImage = mime.startsWith('image/')
  const isVideo = mime.startsWith('video/')
  const isAudio = mime.startsWith('audio/')
  const isPdf = mime === 'application/pdf'
  const needsPreview = isPreviewable(mime)

  // Load preview whenever entry changes
  useEffect(() => {
    if (!entry || entry.type !== 'file' || !needsPreview) {
      return
    }

    let cancelled = false

    // Revoke previous object URL to avoid memory leaks
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
    setPreviewUrl(null)
    setPreviewError(null)
    setIsLoadingPreview(true)

    ;(async () => {
      try {
        // Step 1: download to userData preview-cache (cached by fileId)
        const tempResult = await window.televault.files.downloadToTemp(entry.id)
        if (cancelled) return
        if (!tempResult.ok || !tempResult.data) {
          throw new Error(tempResult.error ?? 'Download failed')
        }
        const localPath = tempResult.data

        // Step 2: read file bytes and create a blob URL
        // For video/audio/PDF use file:// directly (avoids large buffer transfer)
        // For images use blob URL (smaller files, works with CORS-isolated context)
        if (isVideo || isAudio || isPdf) {
          // Electron can load file:// URLs directly in media elements & iframes
          const url = `file://${localPath}`
          if (!cancelled) {
            setPreviewUrl(url)
          }
        } else {
          // Image — read as buffer and convert to blob URL
          const bufResult = await window.televault.files.readLocalFile(localPath)
          if (cancelled) return
          if (!bufResult.ok || !bufResult.data) {
            throw new Error(bufResult.error ?? 'Could not read file')
          }
          const blob = new Blob([bufResult.data], {
            type: mime || 'application/octet-stream',
          })
          const url = URL.createObjectURL(blob)
          objectUrlRef.current = url
          if (!cancelled) {
            setPreviewUrl(url)
          }
        }
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
  }, [entry?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup blob URL when modal closes or component unmounts
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  if (!entry || entry.type !== 'file') return null

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const result = await window.televault.files.download(entry.id)
      if (result.ok) {
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
    if (result.ok) {
      toast.success('Moved to trash')
      setPreviewEntryId(null)
      onClose()
      await refreshFolder()
    } else {
      toast.error(result.error ?? 'Delete failed')
    }
  }

  const renderPreviewBody = () => {
    // Loading state
    if (isLoadingPreview) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
          <Spinner size="lg" />
          <span className="text-sm">Loading preview…</span>
        </div>
      )
    }

    // Error state
    if (previewError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <FileIcon mime={mime} size="lg" />
          <p className="text-sm font-medium text-red-400">Couldn't load preview</p>
          <p className="text-xs text-gray-500 max-w-xs text-center">{previewError}</p>
        </div>
      )
    }

    // Image
    if (isImage && previewUrl) {
      return (
        <div className="flex items-center justify-center overflow-auto">
          <img
            src={previewUrl}
            alt={entry.name}
            className="max-h-[70vh] max-w-[90vw] rounded-lg object-contain cursor-zoom-in shadow-xl"
            onClick={(e) => {
              const img = e.currentTarget
              img.style.maxHeight = img.style.maxHeight === 'none' ? '70vh' : 'none'
              img.style.maxWidth = img.style.maxWidth === 'none' ? '90vw' : 'none'
            }}
          />
        </div>
      )
    }

    // Video
    if (isVideo && previewUrl) {
      return (
        <div className="flex justify-center">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={previewUrl}
            controls
            autoPlay
            className="max-h-[70vh] max-w-full rounded-lg shadow-xl"
          />
        </div>
      )
    }

    // Audio
    if (isAudio && previewUrl) {
      return (
        <div className="flex flex-col items-center gap-6 py-10">
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-purple-500/10">
            <Music className="h-12 w-12 text-purple-400" />
          </div>
          <p className="text-sm font-medium text-gray-200">{entry.name}</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={previewUrl} controls className="w-full max-w-sm" />
        </div>
      )
    }

    // PDF
    if (isPdf && previewUrl) {
      return (
        <iframe
          src={previewUrl}
          title={entry.name}
          className="w-full rounded-lg bg-white"
          style={{ height: '70vh', minHeight: 400 }}
        />
      )
    }

    // Not previewable
    return (
      <div className="flex flex-col items-center gap-4 py-10">
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

  const footer = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={<Download className="h-3.5 w-3.5" />}
          loading={isDownloading}
          onClick={handleDownload}
        >
          Download
        </Button>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={handleDelete}
        >
          Delete
        </Button>
      </div>
      <GatedFeature feature="sharing" inline>
        <Button variant="ghost" size="sm">Share</Button>
      </GatedFeature>
    </div>
  )

  return (
    <Modal isOpen={!!entry} onClose={onClose} title={entry.name} size="lg" footer={footer}>
      <div className="space-y-3">
        {/* Meta bar */}
        <div className="flex items-center gap-2 text-xs text-gray-500 border-b border-gray-700 pb-3">
          <span>{formatFileSize(entry.size)}</span>
          <span className="text-gray-700">·</span>
          <span>{mime || 'Unknown type'}</span>
          <span className="text-gray-700">·</span>
          <span>Uploaded {new Date(entry.uploadedAt).toLocaleDateString()}</span>
        </div>

        {renderPreviewBody()}
      </div>
    </Modal>
  )
}
