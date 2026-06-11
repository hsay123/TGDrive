import clsx from 'clsx'
import {
  File,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Table2,
  Folder,
} from 'lucide-react'

interface FileIconProps {
  mime?: string | null
  size?: 'sm' | 'md' | 'lg'
  isFolder?: boolean
}

const sizeMap = {
  sm: { box: 'h-8 w-8 rounded-lg p-1.5', icon: 'h-4 w-4' },
  md: { box: 'h-12 w-12 rounded-xl p-2.5', icon: 'h-6 w-6' },
  lg: { box: 'h-20 w-20 rounded-2xl p-4', icon: 'h-10 w-10' },
}

function getIconConfig(mime: string | null | undefined) {
  if (!mime) {
    return { Icon: File, bg: 'bg-gray-500/10', color: 'text-gray-400' }
  }
  if (mime.startsWith('image/')) {
    return { Icon: Image, bg: 'bg-green-500/10', color: 'text-green-400' }
  }
  if (mime.startsWith('video/')) {
    return { Icon: Video, bg: 'bg-blue-500/10', color: 'text-blue-400' }
  }
  if (mime.startsWith('audio/')) {
    return { Icon: Music, bg: 'bg-purple-500/10', color: 'text-purple-400' }
  }
  if (mime === 'application/pdf') {
    return { Icon: FileText, bg: 'bg-red-500/10', color: 'text-red-400' }
  }
  if (
    mime.includes('zip') ||
    mime.includes('rar') ||
    mime.includes('tar') ||
    mime.includes('archive') ||
    mime.includes('compressed') ||
    mime === 'application/x-rar-compressed'
  ) {
    return { Icon: Archive, bg: 'bg-orange-500/10', color: 'text-orange-400' }
  }
  if (
    mime.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return { Icon: Table2, bg: 'bg-green-500/10', color: 'text-green-500' }
  }
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return { Icon: FileText, bg: 'bg-blue-500/10', color: 'text-blue-500' }
  }
  if (mime.startsWith('text/')) {
    return { Icon: FileText, bg: 'bg-gray-500/10', color: 'text-gray-400' }
  }
  return { Icon: File, bg: 'bg-gray-500/10', color: 'text-gray-400' }
}

export function FileIcon({ mime, size = 'md', isFolder = false }: FileIconProps) {
  const s = sizeMap[size]

  if (isFolder) {
    return (
      <div className={clsx('flex items-center justify-center bg-violet-500/10', s.box)}>
        <Folder className={clsx(s.icon, 'text-violet-400')} />
      </div>
    )
  }

  const { Icon, bg, color } = getIconConfig(mime)

  return (
    <div className={clsx('flex items-center justify-center', bg, s.box)}>
      <Icon className={clsx(s.icon, color)} />
    </div>
  )
}
