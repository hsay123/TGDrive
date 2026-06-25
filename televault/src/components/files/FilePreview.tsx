import { useState, useEffect } from 'react'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { Spinner } from '../shared/Spinner'
import { FileIcon } from './FileIcon'
import { formatFileSize } from '../../lib/utils'
import { toPreviewUrl } from '../../lib/tvfile'
import type { VFSEntry } from '../../types'
import { Download, Trash2, Music } from 'lucide-react'
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
  }, [entry?.id, needsPreview]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <Button variant="ghost" size="sm">Share</Button>
    </div>
  )

  return (
    <Modal isOpen={!!entry} onClose={onClose} title={entry.name} size="lg" footer={footer}>
      <div className="space-y-3">
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
