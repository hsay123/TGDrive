import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../../store/theme.store'

interface Props {
  size?: number
}

export function ThemeToggle({ size = 16 }: Props) {
  const { theme, toggle } = useThemeStore()

  function handleClick(e: React.MouseEvent) {
    toggle(e.clientX, e.clientY)
  }

  return (
    <button
      id="theme-toggle-btn"
      onClick={handleClick}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: 'rgba(128,128,128,0.10)',
        border: '1px solid rgba(128,128,128,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--fg)',
        transition: 'background 200ms ease, transform 200ms ease, border-color 200ms ease',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(128,128,128,0.18)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(128,128,128,0.10)'
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
      }}
    >
      {theme === 'dark'
        ? <Sun size={size} strokeWidth={1.8} />
        : <Moon size={size} strokeWidth={1.8} />
      }
    </button>
  )
}
