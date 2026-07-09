import { useState } from 'react'
import type { VFSEntry } from '../../types'
import { useAuthStore } from '../../store/auth.store'

interface FilesTableProps {
  files: VFSEntry[]
  selectedIds: Set<string>
  onSelect: (id: string) => void
  onDoubleClick: (file: VFSEntry) => void
  onContextMenu: (e: React.MouseEvent, file: VFSEntry) => void
}

function getFileTypeInfo(mime: string | null | undefined): { label: string; bg: string; color: string } {
  if (!mime) return { label: 'FILE', bg: 'rgba(156,163,175,0.12)', color: 'rgba(156,163,175,0.7)' }

  if (mime === 'application/pdf') return { label: 'PDF', bg: 'rgba(239,68,68,0.12)', color: '#f87171' }
  if (mime.startsWith('image/')) return { label: 'IMG', bg: 'rgba(74,222,128,0.12)', color: '#4ade80' }
  if (mime.startsWith('video/')) return { label: 'VID', bg: 'rgba(96,165,250,0.12)', color: '#60a5fa' }
  if (mime.startsWith('audio/')) return { label: 'MP3', bg: 'rgba(168,85,247,0.12)', color: '#a855f7' }
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('archive') || mime.includes('compressed'))
    return { label: 'ZIP', bg: 'rgba(251,146,60,0.12)', color: '#fb923c' }
  if (mime.includes('spreadsheet') || mime === 'application/vnd.ms-excel' || mime.includes('sheet'))
    return { label: 'XLS', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }
  if (mime === 'application/msword' || mime.includes('wordprocessing'))
    return { label: 'DOC', bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' }
  if (mime.includes('figma') || mime.includes('fig'))
    return { label: 'FIG', bg: 'rgba(168,85,247,0.12)', color: '#a855f7' }
  if (mime.startsWith('text/')) return { label: 'TXT', bg: 'rgba(156,163,175,0.12)', color: '#9ca3af' }

  // Try to extract extension-based label
  const sub = mime.split('/')[1]
  if (sub) {
    return { label: sub.slice(0, 3).toUpperCase(), bg: 'rgba(156,163,175,0.12)', color: 'rgba(156,163,175,0.7)' }
  }

  return { label: 'FILE', bg: 'rgba(156,163,175,0.12)', color: 'rgba(156,163,175,0.7)' }
}

export function FilesTable({ files, selectedIds, onSelect, onDoubleClick, onContextMenu }: FilesTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const user = useAuthStore((s) => s.user)

  return (
    <div style={{
      borderRadius: 20,
      overflow: 'hidden',
      background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        padding: '14px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        fontSize: 12, fontWeight: 600,
        color: 'rgba(255,255,255,0.35)',
        letterSpacing: '0.2px',
        textTransform: 'uppercase',
      }}>
        <div>File</div>
        <div>Uploaded</div>
      </div>

      {/* File rows */}
      {files.map((file) => {
        const isHovered = hoveredId === file.id
        const isSelected = selectedIds.has(file.id)
        const typeInfo = file.type === 'file'
          ? getFileTypeInfo(file.mimeType)
          : { label: 'DIR', bg: 'rgba(251,113,133,0.12)', color: '#fb7185' }

        return (
          <div
            key={file.id}
            onClick={() => onSelect(file.id)}
            onDoubleClick={() => onDoubleClick(file)}
            onContextMenu={(e) => onContextMenu(e, file)}
            onMouseEnter={() => setHoveredId(file.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              padding: '14px 24px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'background 150ms',
              background: isSelected
                ? 'rgba(251,113,133,0.1)'
                : isHovered
                ? 'rgba(255,255,255,0.04)'
                : 'transparent',
            }}
          >
            {/* File name with icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: typeInfo.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, color: typeInfo.color,
                  letterSpacing: '0.2px',
                }}>
                  {typeInfo.label}
                </span>
              </div>
              <span style={{
                fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.9)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: 240,
              }}>{file.name}</span>
            </div>

            {/* Uploader */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'linear-gradient(135deg, #f43f5e, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: '#fff',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(244,63,94,0.3)',
              }}>
                {user?.firstName?.[0]?.toUpperCase() ?? 'Y'}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
                {user?.username ?? user?.firstName ?? 'You'}
              </span>
            </div>
          </div>
        )
      })}

      {files.length === 0 && (
        <div style={{
          padding: '40px 24px',
          textAlign: 'center',
          fontSize: 14,
          color: 'rgba(255,255,255,0.3)',
        }}>
          No files yet
        </div>
      )}
    </div>
  )
}
