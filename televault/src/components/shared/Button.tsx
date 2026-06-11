import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

const variants = {
  primary: 'bg-violet-600 hover:bg-violet-500 text-white active:scale-95 transition-all duration-100',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-gray-100 active:scale-95 transition-all duration-100',
  ghost: 'hover:bg-gray-800 text-gray-300 active:scale-95 transition-all duration-100',
  danger: 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/30 active:scale-95 transition-all duration-100',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  fullWidth,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-900',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner size="sm" color={variant === 'primary' ? 'white' : 'violet'} /> : icon}
      {children}
    </button>
  )
}
