import { useState, useEffect, useMemo, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from '../shared/Modal'
import { Spinner } from '../shared/Spinner'
import { FileIcon } from './FileIcon'
import { formatFileSize } from '../../lib/utils'
import { toPreviewUrl } from '../../lib/tvfile'
import {
  getTextPreviewMode,
  TEXT_PREVIEW_MAX_BYTES,
  type TextPreviewMode,
} from '../../lib/filePreviewMode'
import type { VFSEntry } from '../../types'
import { Download, Trash2, Music, Share2, Info, X, Code2 } from 'lucide-react'
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
  const [textContent, setTextContent] = useState<string | null>(null)
  const [MarkdownRenderer, setMarkdownRenderer] = useState<ComponentType<any> | null>(null)
  const [highlightCodeFn, setHighlightCodeFn] = useState<((code: string, lang: string) => string) | null>(null)
  const [highlightLang, setHighlightLang] = useState<string | null>(null)

  const refreshFolder = useFilesStore((s) => s.refreshFolder)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)

  const mime = (entry?.type === 'file' ? entry.mimeType : null) ?? ''
  const isImage = mime.startsWith('image/')
  const isVideo = mime.startsWith('video/')
  const isAudio = mime.startsWith('audio/')
  const isPdf = mime === 'application/pdf'
  const needsPreview = isPreviewable(mime)
  const textMode = useMemo<TextPreviewMode | null>(
    () => (entry?.type === 'file' ? getTextPreviewMode(entry.name, entry.mimeType) : null),
    [entry]
  )

  useEffect(() => {
    if (!entry || entry.type !== 'file' || (!needsPreview && !textMode)) {
      return
    }

    let cancelled = false

    setPreviewUrl(null)
    setPreviewError(null)
    setIsLoadingPreview(true)
    setContextMenu(null)
    setTextContent(null)
    setMarkdownRenderer(null)
    setHighlightCodeFn(null)
    setHighlightLang(null)

    ;(async () => {
      try {
        // Never pull a huge file into the preview just to read it: guard on the
        // recorded size before touching the network, and re-guard on the actual
        // text length after (covers entries whose size was unknown at upload).
        if (textMode && entry.size > TEXT_PREVIEW_MAX_BYTES) {
          throw new Error('File is too large to preview (5 MB limit). Download it to view the full content.')
        }

        const tempResult = await window.televault.files.downloadToTemp(entry.id)
        if (cancelled) return
        if (!tempResult.success || !tempResult.data) {
          throw new Error(tempResult.error ?? 'Download failed')
        }
        const cachedPath = tempResult.data

        if (textMode) {
          // Notes / code: fetch the raw UTF-8 text and render it ourselves
          // (markdown renderer or syntax highlighter) instead of ever exposing
          // the file as a live document.
          const response = await fetch(toPreviewUrl(cachedPath))
          if (!response.ok) {
            throw new Error(`Could not read file content (HTTP ${response.status})`)
          }
          const text = await response.text()
          if (cancelled) return
          if (text.length > TEXT_PREVIEW_MAX_BYTES) {
            throw new Error('File is too large to preview (5 MB limit). Download it to view the full content.')
          }
          setTextContent(text)

          if (textMode.kind === 'notes') {
            if (textMode.markdown) {
              const { default: Markdown } = await import('react-markdown')
              if (!cancelled) setMarkdownRenderer(() => Markdown)
            }
          } else if (textMode.kind === 'code') {
            const { highlightCode } = await import('../../lib/codeHighlight')
            if (!cancelled) {
              setHighlightCodeFn(() => highlightCode)
              setHighlightLang(textMode.lang)
            }
          }
        } else {
          setPreviewUrl(toPreviewUrl(cachedPath))
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
  }, [entry?.id, needsPreview, textMode])

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

  // --- FULL-SCREEN VIDEO VIEWER ---
  if (isVideo) {
    return createPortal(
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.90)',
          backdropFilter: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onContextMenu={handleContextMenu}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(92vw, 1200px)',
            maxWidth: '92vw',
            height: 'min(88vh, 820px)',
            maxHeight: '88vh',
            borderRadius: 16,
            background: '#000',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 32px 96px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {isLoadingPreview ? (
            <div style={{
              flex: 1, background: '#000',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
              position: 'relative', overflow: 'hidden',
            }}>
              {entry.thumbnailPath && (
                <img
                  src={`tvfile://thumbnails/${entry.thumbnailPath.split(/[/\\]/).pop()}`}
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                    filter: 'blur(20px) brightness(0.3)',
                    transform: 'scale(1.05)',
                  }}
                />
              )}
              <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.15)',
                  borderTop: '3px solid rgba(255,255,255,0.8)',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 14px',
                }} />
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500 }}>
                  Loading video…
                </div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 4 }}>
                  Downloading from Telegram
                </div>
              </div>
            </div>
          ) : previewError ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 flex-1">
              <FileIcon mime={mime} size="lg" />
              <p className="text-sm font-medium text-red-400">Couldn't load preview</p>
              <p className="text-xs text-gray-500 max-w-xs text-center">{previewError}</p>
            </div>
          ) : previewUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'rgba(0,0,0,0.6)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: 'rgba(0,122,255,0.20)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="rgba(0,122,255,0.9)" strokeWidth="2" strokeLinecap="round">
                      <polygon points="23 7 16 12 23 17 23 7"/>
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: 'rgba(255,255,255,0.92)',
                      maxWidth: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{entry.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>
                      {formatFileSize(entry.size ?? 0)} · {entry.mimeType}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => window.televault.files.download(entry.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.80)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Download
                  </button>
                  <button
                    onClick={onClose}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.10)',
                      border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(255,255,255,0.7)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 14,
                    }}
                  >✕</button>
                </div>
              </div>

              <div style={{
                flex: 1,
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                <video
                  src={previewUrl}
                  controls
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    outline: 'none',
                    background: '#000',
                  }}
                  onError={(e) => {
                    console.error('[video preview] playback error:', e)
                    setPreviewError('Video failed to play. Try downloading it instead.')
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
        <ContextMenuDropdown />
      </div>,
      document.body
    )
  }

  // --- FULL-SCREEN PDF VIEWER ---
  if (isPdf) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0f]/95 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
        onContextMenu={handleContextMenu}
      >
        {/* Minimal top bar: filename + close */}
        <div
          className="flex items-center justify-between gap-4 px-5 py-3 shrink-0 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <FileIcon mime={mime} size="sm" />
            <span className="truncate text-sm font-medium text-gray-200">{entry.name}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoadingPreview && (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" />
              <span className="text-sm">Loading PDF…</span>
            </div>
          </div>
        )}

        {previewError && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <FileIcon mime={mime} size="lg" />
              <p className="text-sm font-medium text-red-400">Couldn't load preview</p>
              <p className="text-xs text-gray-500 max-w-xs text-center">{previewError}</p>
            </div>
          </div>
        )}

        {previewUrl && !isLoadingPreview && !previewError && (
          <div
            className="flex-1 min-h-0 px-3 pb-3"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={previewUrl}
              title={entry.name}
              className="h-full w-full rounded-xl"
            />
          </div>
        )}

        <ContextMenuDropdown />
      </div>,
      document.body
    )
  }

  // --- FULL-SCREEN NOTES VIEWER (Markdown / plain text) ---
  if (textMode?.kind === 'notes') {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0f]/95 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
        onContextMenu={handleContextMenu}
      >
        {/* Minimal top bar: filename + close */}
        <div
          className="flex items-center justify-between gap-4 px-5 py-3 shrink-0 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <FileIcon mime={mime} size="sm" />
            <span className="truncate text-sm font-medium text-gray-200">{entry.name}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoadingPreview && (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" />
              <span className="text-sm">Loading preview…</span>
            </div>
          </div>
        )}

        {previewError && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <FileIcon mime={mime} size="lg" />
              <p className="text-sm font-medium text-red-400">Couldn't load preview</p>
              <p className="text-xs text-gray-500 max-w-xs text-center">{previewError}</p>
            </div>
          </div>
        )}

        {textContent && !isLoadingPreview && !previewError && (
          <div
            className="flex-1 min-h-0 overflow-y-auto px-6 py-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto max-w-[720px]">
              {textMode.markdown && MarkdownRenderer ? (
                <MarkdownRenderer
                  className="tv-md"
                  components={{
                    // Keep the preview self-contained: route any link the app
                    // hasn't seen to the OS browser via Electron's window-open
                    // handler, never navigate inside the app.
                    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          if (href) {
                            e.preventDefault()
                            window.open(href, '_blank')
                          }
                        }}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {textContent}
                </MarkdownRenderer>
              ) : (
                <pre className="tv-txt whitespace-pre-wrap">{textContent}</pre>
              )}
            </div>
          </div>
        )}

        <ContextMenuDropdown />
      </div>,
      document.body
    )
  }

  // --- FULL-SCREEN CODE EDITOR (syntax-highlighted source) ---
  if (textMode?.kind === 'code') {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0f]/95 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
        onContextMenu={handleContextMenu}
      >
        {/* Minimal top bar: filename + language badge + close */}
        <div
          className="flex items-center justify-between gap-4 px-5 py-3 shrink-0 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center gap-3">
            <FileIcon mime={mime} size="sm" />
            <span className="truncate text-sm font-medium text-gray-200">{entry.name}</span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-[#0d1117] border border-white/10 px-2 py-0.5 text-[11px] font-medium text-gray-400">
              <Code2 className="h-3 w-3" />
              {textMode.lang}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoadingPreview && (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            <div className="flex flex-col items-center gap-3">
              <Spinner size="lg" />
              <span className="text-sm">Loading preview…</span>
            </div>
          </div>
        )}

        {previewError && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <FileIcon mime={mime} size="lg" />
              <p className="text-sm font-medium text-red-400">Couldn't load preview</p>
              <p className="text-xs text-gray-500 max-w-xs text-center">{previewError}</p>
            </div>
          </div>
        )}

        {textContent && highlightCodeFn && highlightLang && !isLoadingPreview && !previewError && (
          <div
            className="flex-1 min-h-0 overflow-auto tv-code-scroll"
            onClick={(e) => e.stopPropagation()}
          >
            <CodePreviewLines
              code={textContent}
              lang={highlightLang}
              highlight={highlightCodeFn}
            />
          </div>
        )}

        <ContextMenuDropdown />
      </div>,
      document.body
    )
  }

  // --- FALLBACK VIEWER FOR OTHER TYPES (Audio, etc) ---
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

/**
 * Renders Prism's tokenized HTML one line at a time so line numbers can be
 * drawn with a pure-CSS counter. The HTML is always Prism's escaped, token
 * wrapped output (never raw file content), so this is the only safe use of
 * dangerouslySetInnerHTML in the preview layers.
 */
function CodePreviewLines({
  code,
  lang,
  highlight,
}: {
  code: string
  lang: string
  highlight: (code: string, lang: string) => string
}) {
  const html = useMemo(() => highlight(code, lang), [code, lang, highlight])
  const lines = useMemo(() => html.split('\n'), [html])
  return (
    <div className="tv-code-block">
      {lines.map((line, i) => (
        <div
          key={i}
          className="tv-code-line"
          dangerouslySetInnerHTML={{ __html: line || ' ' }}
        />
      ))}
    </div>
  )
}
