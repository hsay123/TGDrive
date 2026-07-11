import { motion } from 'motion/react'
import { useState, useId } from 'react'

interface FolderCardProps {
  name: string
  fileCount: number
  selected?: boolean
  onClick?: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function FolderCard({
  name, fileCount, onClick, onDoubleClick, onContextMenu,
}: FolderCardProps) {
  const [hovered, setHovered] = useState(false)
  const uid = useId().replace(/:/g, '')

  // Three paper sheets that fan out when folder opens
  const papers = [
    {
      base:  { rotate: -5, x: -14, y: 0 },
      open:  { rotate: -12, x: -38, y: -36 },
      bg: 'linear-gradient(155deg, #f9f9fb 0%, #e2e2e5 100%)',
      shadow: '0 4px 12px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.9) inset',
      z: 1,
    },
    {
      base:  { rotate: 0, x: 0, y: -2 },
      open:  { rotate: 0, x: 0, y: -46 },
      bg: 'linear-gradient(155deg, #ffffff 0%, #eaeaed 100%)',
      shadow: '0 4px 12px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,1) inset',
      z: 3,
    },
    {
      base:  { rotate: 5, x: 14, y: 0 },
      open:  { rotate: 12, x: 38, y: -34 },
      bg: 'linear-gradient(155deg, #f3f3f6 0%, #d5d5d8 100%)',
      shadow: '0 4px 12px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.8) inset',
      z: 0,
    },
  ]

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 10,
        cursor: 'pointer', userSelect: 'none',
      }}
      onClick={onClick}
      onDoubleClick={() => { onDoubleClick?.() }}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── FOLDER ILLUSTRATION ── */}
      <div style={{ position: 'relative', width: 148, height: 112 }}>


        {/* PAPERS */}
        {papers.map((p, i) => (
          <motion.div
            key={`${uid}_p${i}`}
            initial={p.base}
            animate={hovered ? p.open : p.base}
            transition={{ type: 'spring', stiffness: 180, damping: 22, duration: 0.5 }}
            style={{
              position: 'absolute',
              width: 68, height: 70,
              borderRadius: '6px 6px 5px 5px',
              background: p.bg,
              bottom: 24, left: '50%',
              marginLeft: -34,
              transformOrigin: 'bottom center',
              boxShadow: p.shadow,
              zIndex: p.z,
            }}
          />
        ))}

        {/* FOLDER BACK */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0, height: 90,
          borderRadius: 16,
          background: 'linear-gradient(175deg, #757577 0%, #606062 30%, #4a4a4c 65%, #383839 100%)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.10) inset, 0 -1px 0 rgba(0,0,0,0.4) inset',
          zIndex: 4,
        }}>
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
          zIndex: 5, overflow: 'visible',
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
          bottom: 68, left: 8, right: 8, height: 8, zIndex: 6,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)',
          borderRadius: '0 0 5px 5px', pointerEvents: 'none',
        }} />

        {/* FOLDER FRONT PANEL — flips on click */}
        <motion.div
          animate={{ rotateX: hovered ? -35 : 0 }}
          transition={{ type: 'spring', duration: 0.48, bounce: 0.18 }}
          style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0, height: 68,
            borderRadius: '0 0 16px 16px',
            transformOrigin: 'bottom center',
            background: 'linear-gradient(175deg, #828284 0%, #6a6a6c 35%, #515153 70%, #3f3f41 100%)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.15) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
            zIndex: 10,
            overflow: 'hidden',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            paddingBottom: 10,
          }}
        >
          {/* Curved top lip */}
          <div style={{
            position: 'absolute',
            top: -9, left: -10, right: -10, height: 20,
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
        </motion.div>

      </div>

      {/* ── LABEL ── */}
      <div style={{ textAlign: 'center' }}>
        <h3 style={{
          fontSize: 14, fontWeight: 500,
          letterSpacing: '-0.1px', marginBottom: 2,
          maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} className="text-neutral-900 dark:text-white/88">{name}</h3>
        <p className="text-neutral-500 dark:text-white/35" style={{ fontSize: 11 }}>
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </p>
      </div>
    </div>
  )
}
