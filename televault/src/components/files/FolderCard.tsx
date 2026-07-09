import { useState } from 'react'

interface FolderCardProps {
  folder?: any
  name?: string
  fileCount?: number
  selected?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function FolderCard({ folder, name: nameProp, fileCount: fileCountProp, selected, onClick, onDoubleClick, onContextMenu }: FolderCardProps) {
  const [hovered, setHovered] = useState(false)
  const name = folder?.name ?? nameProp ?? 'Unknown'
  const fileCount = folder?.fileCount ?? fileCountProp ?? 0

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 200,
        minHeight: 210,
        borderRadius: 24,
        background: selected
          ? 'rgba(251,113,133,0.08)'
          : hovered
            ? 'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)'
            : 'transparent',
        backdropFilter: hovered || selected ? 'blur(16px)' : 'none',
        WebkitBackdropFilter: hovered || selected ? 'blur(16px)' : 'none',
        border: selected
          ? '1px solid rgba(251,113,133,0.5)'
          : hovered
            ? '1px solid rgba(255,255,255,0.18)'
            : '1px solid transparent',
        boxShadow: selected
          ? 'inset 0 1px 2px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.4)'
          : hovered
            ? 'inset 0 1px 2px rgba(255,255,255,0.1), 0 24px 64px rgba(0,0,0,0.6)'
            : 'none',
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        padding: '24px 16px 20px',
        gap: 14,
        userSelect: 'none' as const,
        transform: hovered ? 'scale(1.03) translateY(-4px)' : 'scale(1) translateY(0)',
        transition: 'all 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        overflow: 'hidden',
      }}
    >
      {/* Subtle top sheen */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 60,
        background: 'radial-gradient(ellipse at 50% -10%, rgba(255,255,255,0.04) 0%, transparent 70%)',
        borderRadius: '20px 20px 0 0', pointerEvents: 'none',
      }} />

      {/* Selected badge */}
      {selected && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          width: 22, height: 22, borderRadius: '50%',
          background: '#6459f0',
          boxShadow: '0 0 0 3px rgba(100,89,240,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* FOLDER ILLUSTRATION */}
      <div style={{ position: 'relative', width: 148, height: 112 }}>

        {/* Glow bloom underneath folder */}
        <div style={{
          position: 'absolute',
          bottom: -12, left: '50%',
          transform: 'translateX(-50%)',
          width: 160, height: 40,
          background: 'radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.7) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* PAPERS — layer 2, behind front panel */}
        {[
          {
            bg: 'linear-gradient(155deg, #f9f9fb 0%, #e2e2e5 100%)',
            baseTransform: 'translateX(calc(-50% - 4px)) rotate(-5deg)',
            hoverTransform: 'translateX(calc(-50% - 14px)) rotate(-8deg) translateY(-13px)',
            z: 1,
            shadow: '0 4px 12px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.9) inset',
          },
          {
            bg: 'linear-gradient(155deg, #ffffff 0%, #eaeaed 100%)',
            baseTransform: 'translateX(-50%) rotate(0deg) translateY(-2px)',
            hoverTransform: 'translateX(-50%) rotate(0deg) translateY(-18px)',
            z: 3,
            shadow: '0 4px 12px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,1) inset',
          },
          {
            bg: 'linear-gradient(155deg, #f3f3f6 0%, #d5d5d8 100%)',
            baseTransform: 'translateX(calc(-50% + 4px)) rotate(5deg) translateY(-1px)',
            hoverTransform: 'translateX(calc(-50% + 14px)) rotate(8deg) translateY(-11px)',
            z: 0,
            shadow: '0 4px 12px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.8) inset',
          },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: 68, height: 70,
            borderRadius: '6px 6px 5px 5px',
            background: p.bg,
            bottom: 24, left: '50%',
            transformOrigin: 'bottom center',
            transition: 'transform 380ms cubic-bezier(.22,.61,.36,1)',
            transform: hovered ? p.hoverTransform : p.baseTransform,
            boxShadow: p.shadow,
            zIndex: p.z,
          }} />
        ))}

        {/* FOLDER BACK — full body */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 90,
          borderRadius: 16,
          background: 'linear-gradient(175deg, #757577 0%, #606062 30%, #4a4a4c 65%, #383839 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 -1px 0 rgba(0,0,0,0.4) inset',
          zIndex: 4,
        }}>
          {/* Back inner glow */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 16,
            background: 'radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.08) 0%, transparent 55%)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* FOLDER TAB */}
        <div style={{
          position: 'absolute',
          bottom: 80, left: 0,
          width: 55, height: 20,
          zIndex: 5,
          overflow: 'visible',
        }}>
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0,
            width: 55, height: 26,
            background: 'linear-gradient(180deg, #8a8a8c 0%, #717173 100%)',
            borderRadius: '9px 13px 0 0',
            clipPath: 'polygon(0 26px, 0 7px, 5px 0, 44px 0, 55px 13px, 55px 26px)',
            boxShadow: '0 -1px 0 rgba(255,255,255,0.16) inset',
          }} />
        </div>

        {/* Opening shadow */}
        <div style={{
          position: 'absolute',
          bottom: 68, left: 8, right: 8,
          height: 8, zIndex: 6,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)',
          borderRadius: '0 0 5px 5px',
          pointerEvents: 'none',
        }} />

        {/* FOLDER FRONT PANEL */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: 68,
          borderRadius: '0 0 16px 16px',
          background: 'linear-gradient(175deg, #828284 0%, #6a6a6c 35%, #515153 70%, #3f3f41 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
          zIndex: 10,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 10,
        }}>
          {/* Curved top lip */}
          <div style={{
            position: 'absolute',
            top: -9, left: -10, right: -10,
            height: 20,
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #757577 0%, #808082 100%)',
          }} />
          {/* Front sheen */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 35% 20%, rgba(255,255,255,0.12) 0%, transparent 52%)',
            pointerEvents: 'none',
          }} />
          {/* Watermark */}
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
            color: 'rgba(255,255,255,0.20)', zIndex: 1, position: 'relative',
          }}>TeleVault</span>
        </div>
      </div>

      {/* LABEL */}
      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <h3 style={{
          fontSize: 15, fontWeight: 600,
          color: 'rgba(255,255,255,0.92)',
          letterSpacing: '-0.2px', lineHeight: 1.2,
          marginBottom: 4,
          maxWidth: 168,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</h3>
        <p style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.38)',
        }}>{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
      </div>
    </div>
  )
}
