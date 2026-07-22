import { useState } from 'react'
import { useAuthStore } from '../../store/auth.store'

interface UserAvatarProps {
  size?: number
  borderRadius?: number
}

export function UserAvatar({ size = 36, borderRadius = 10 }: UserAvatarProps) {
  const user = useAuthStore(s => s.user)
  const avatarUrl = useAuthStore(s => s.avatarUrl)
  const [imgFailed, setImgFailed] = useState(false)

  const initial = user?.firstName?.[0]?.toUpperCase()
    ?? user?.username?.[0]?.toUpperCase()
    ?? '?'

  // Show real photo if available and loaded successfully
  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={user?.firstName ?? 'User'}
        onError={() => setImgFailed(true)}  // fallback if load fails
        style={{
          width: size,
          height: size,
          borderRadius,
          objectFit: 'cover',
          flexShrink: 0,
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'block',
        }}
      />
    )
  }

  // Fallback: colored circle with initial letter
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius,
      background: 'linear-gradient(135deg, #5e5ce6, #bf5af2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.38,
      fontWeight: 700,
      color: '#fff',
      flexShrink: 0,
      letterSpacing: '-0.5px',
    }}>
      {initial}
    </div>
  )
}
