import clsx from 'clsx'

interface ProgressBarProps {
  percent: number
  size?: 'sm' | 'md'
  color?: 'violet' | 'teal' | 'red'
  animated?: boolean
  showLabel?: boolean
}

const heights = {
  sm: 'h-1',
  md: 'h-2',
}

const colors = {
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
  red: 'bg-red-500',
}

export function ProgressBar({
  percent,
  size = 'sm',
  color = 'violet',
  animated = false,
  showLabel = false,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, percent))

  return (
    <div className="w-full">
      <div className={clsx('w-full overflow-hidden rounded-full bg-gray-700', heights[size])}>
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-300 ease-out',
            colors[color],
            animated && 'relative overflow-hidden'
          )}
          style={{ width: `${clamped}%` }}
        >
          {animated && (
            <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          )}
        </div>
      </div>
      {showLabel && (
        <div className="mt-1 text-right text-xs text-gray-500">{Math.round(clamped)}%</div>
      )}
    </div>
  )
}
