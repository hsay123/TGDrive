import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Eye,
  Download,
  Pencil,
  FolderInput,
  History,
  Share2,
  Trash2,
  Trash,
  Star,
  Image as ImageIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { VFSEntry } from '../../types'
import { useFilesStore } from '../../store/files.store'
import { useUIStore } from '../../store/ui.store'
import clsx from 'clsx'

interface ContextMenuProps {
  x: number
  y: number
  entries: VFSEntry[]
  onClose: () => void
}

interface MenuItem {
  label: string
  icon: React.ReactNode
  action: () => void
  danger?: boolean
  disabled?: boolean
  dividerBefore?: boolean
}

export function ContextMenu({ x, y, entries, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isTrashView = useFilesStore((s) => s.isTrashView)
  const refreshFolder = useFilesStore((s) => s.refreshFolder)
  const setRenamingId = useFilesStore((s) => s.setRenamingId)
  const setPreviewEntryId = useUIStore((s) => s.setPreviewEntryId)
  const openMoveToModal = useUIStore((s) => s.openMoveToModal)
  const clearSelection = useFilesStore((s) => s.clearSelection)

  const isBulk = entries.length > 1
  const targetIds = entries.map((e) => e.id)
  const entry = entries[0] // Used for single-item actions (preview, rename, etc.)
  const bulkLabel = (base: string) => isBulk ? `${base} (${targetIds.length} items)` : base

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      await refreshFolder()
      clearSelection()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed')
    }
  }

  const isFile = entry.type === 'file'
  const isStarred = isFile && (entry as any).starred === 1

  const items: MenuItem[] = [
    {
      label: isFile ? 'Preview' : 'Open',
      icon: <Eye className="h-3.5 w-3.5" />,
      action: () => {
        if (isBulk) {
          toast('Preview/Open is only available for single items')
        } else if (isFile) {
          setPreviewEntryId(entry.id)
        } else {
          useFilesStore.getState().setPath(entry.path)
        }
        onClose()
      },
    },
  ]

  // Only for single video files without a cached thumbnail
  if (isFile && !isBulk && entry.mimeType?.startsWith('video/') && !entry.thumbnailPath) {
    items.push({
      label: 'Generate Thumbnail',
      icon: <ImageIcon className="h-3.5 w-3.5" />,
      action: () => {
        onClose()
        window.dispatchEvent(
          new CustomEvent('televault:regenerate-thumb', {
            detail: { fileId: entry.id },
          })
        )
      },
    })
  }

  if (isFile) {
    items.push({
      label: bulkLabel('Download'),
      icon: <Download className="h-3.5 w-3.5" />,
      action: () =>
        run(async () => {
          for (const id of targetIds) {
            const result = await window.televault.files.download(id)
            if (!result.success) throw new Error(result.error)
          }
          toast.success(isBulk ? 'Downloads started' : 'Download started')
        }),
      dividerBefore: true,
    })
  }

  if (!isTrashView) {
    items.push({
      label: 'Rename',
      icon: <Pencil className="h-3.5 w-3.5" />,
      action: () => {
        setRenamingId(entry.id)
        onClose()
      },
      disabled: isBulk,
    })
    items.push({
      label: bulkLabel('Move to…'),
      icon: <FolderInput className="h-3.5 w-3.5" />,
      action: () => {
        openMoveToModal(targetIds, entry.type)
        onClose()
      },
    })
  }

  if (isFile && !isTrashView) {
    items.push({
      label: isStarred ? bulkLabel('Unstar') : bulkLabel('Star'),
      icon: <Star className={clsx('h-3.5 w-3.5', isStarred && 'fill-yellow-400 text-yellow-400')} />,
      action: () =>
        run(async () => {
          for (const id of targetIds) {
            const result = await window.televault.files.toggleStar(id)
            if (!result.success) throw new Error(result.error)
          }
          toast.success(isStarred ? 'Unstarred' : 'Starred')
        }),
      dividerBefore: true,
    })
    items.push({
      label: 'Version History',
      icon: <History className="h-3.5 w-3.5" />,
      action: () => toast('Version history — coming soon (Pro feature)'),
      disabled: true,
    })
    items.push({
      label: 'Share Link',
      icon: <Share2 className="h-3.5 w-3.5" />,
      action: () =>
        run(async () => {
          const result = await window.televault.files.shareLink(entry.id)
          if (!result.success) throw new Error(result.error)
          await navigator.clipboard.writeText(result.data!.url)
          toast.success('Link copied! Note: only works for accounts with access to your TeleVault Telegram channels.')
        }),
      disabled: isBulk,
    })
  }

  if (isTrashView) {
    items.push({
      label: bulkLabel('Restore'),
      icon: <Trash className="h-3.5 w-3.5" />,
      action: () =>
        run(async () => {
          for (const id of targetIds) {
            const result = await window.televault.files.restore(id)
            if (!result.success) throw new Error(result.error)
          }
        }),
      dividerBefore: true,
    })
    items.push({
      label: bulkLabel('Delete permanently'),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      action: () => {
        if (!confirm(`Permanently delete ${targetIds.length === 1 ? 'this file' : `these ${targetIds.length} items`}? This cannot be undone.`)) return
        run(async () => {
          for (const id of targetIds) {
            const result = await window.televault.files.delete(id, true)
            if (!result.success) throw new Error(result.error)
          }
        })
      },
      danger: true,
    })
  } else {
    items.push({
      label: bulkLabel('Move to Trash'),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      action: () =>
        run(async () => {
          for (const id of targetIds) {
            const result = await window.televault.files.delete(id, false)
            if (!result.success) throw new Error(result.error)
          }
        }),
      danger: true,
      dividerBefore: true,
    })
  }

  // Auto-flip positioning
  const menuWidth = 200
  const menuHeight = items.length * 36 + 16
  const adjustedX = x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 8 : x
  const adjustedY = y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 8 : y

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 min-w-[200px] rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && i > 0 && (
            <div className="my-1 border-t border-gray-800" />
          )}
          <button
            className={clsx(
              'flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-md mx-1 transition-colors duration-100',
              item.disabled
                ? 'text-gray-600 cursor-not-allowed'
                : item.danger
                  ? 'text-red-400 hover:bg-red-500/10 cursor-pointer'
                  : 'text-gray-200 hover:bg-gray-800 cursor-pointer',
              'w-[calc(100%-8px)]'
            )}
            onClick={item.disabled ? undefined : item.action}
            disabled={item.disabled}
          >
            {item.icon}
            {item.label}
            {item.disabled && (
              <span className="ml-auto text-[10px] text-gray-700">Soon</span>
            )}
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
