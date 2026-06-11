import clsx from 'clsx'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: 'violet' | 'white' | 'gray'
  className?: string
}

const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
}

const colors = {
  violet: 'border-gray-700 border-t-violet-500',
  white: 'border-gray-500 border-t-white',
  gray: 'border-gray-800 border-t-gray-500',
}

export function Spinner({ size = 'md', color = 'violet', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full',
        sizes[size],
        colors[color],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  )
}
