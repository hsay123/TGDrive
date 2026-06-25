import { useState } from 'react'
import { ChevronRight, Folder, HardDrive } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '../shared/Modal'
import { Button } from '../shared/Button'
import { useUIStore } from '../../store/ui.store'
import { useFilesStore } from '../../store/files.store'
import { useTreeStore } from '../../store/tree.store'
import type { VFSFolder } from '../../types'

function MoveToTreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  excludeId,
}: {
  node: VFSFolder
  depth: number
  selectedPath: string
  onSelect: (path: string) => void
  excludeId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (node.id === excludeId) return null

  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-1 rounded-md cursor-pointer text-sm py-1.5 pr-2 group',
          selectedPath === node.path
            ? 'bg-violet-600/20 text-violet-300'
            : 'text-gray-300 hover:bg-gray-700'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            size={14}
            className={clsx(
              'flex-shrink-0 transition-transform duration-150 text-gray-500',
              expanded && 'rotate-90'
            )}
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          />
        ) : (
          <span className="w-3.5" />
        )}
        <Folder size={14} className="flex-shrink-0 text-violet-400" />
        <span className="flex-1 truncate" onClick={() => onSelect(node.path)}>
          {node.name}
        </span>
      </div>
      {expanded &&
        node.children.map((child) => (
          <MoveToTreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            excludeId={excludeId}
          />
        ))}
    </div>
  )
}

export function MoveToModal() {
  const moveToModal = useUIStore((s) => s.moveToModal)
  const closeMoveToModal = useUIStore((s) => s.closeMoveToModal)
  const tree = useTreeStore((s) => s.tree)
  const currentPath = useFilesStore((s) => s.currentPath)
  const refreshFolder = useFilesStore((s) => s.refreshFolder)

  const [selectedPath, setSelectedPath] = useState('/')
  const [isMoving, setIsMoving] = useState(false)

  if (!moveToModal) return null

  const { entryIds, entryType } = moveToModal

  async function handleMove() {
    setIsMoving(true)
    try {
      for (const id of entryIds) {
        if (entryType === 'file') {
          // files.move calls moveFileToFolder(id, folderPath) which appends the filename
          const result = await window.televault.files.move(id, selectedPath)
          if (!result.success) throw new Error(result.error)
        } else {
          // folders.move calls moveFolder(id, newParentPath)
          const result = await window.televault.folders.move(id, selectedPath)
          if (!result.success) throw new Error(result.error)
        }
      }
      toast.success(`Moved ${entryIds.length} item${entryIds.length > 1 ? 's' : ''} successfully`)
      closeMoveToModal()
      // Refresh tree so sidebar reflects the new structure
      const treeStore = await import('../../store/tree.store')
      treeStore.useTreeStore.getState().loadTree()
      await refreshFolder()
    } catch (err) {
      toast.error(`Move failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsMoving(false)
    }
  }

  const isAtSamePath = entryType === 'file'
    ? selectedPath === currentPath
    : false

  return (
    <Modal
      isOpen={!!moveToModal}
      onClose={closeMoveToModal}
      title="Move to…"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={closeMoveToModal} disabled={isMoving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleMove}
            disabled={isAtSamePath || isMoving}
            loading={isMoving}
          >
            Move here
          </Button>
        </div>
      }
    >
      <p className="text-xs text-gray-500 mb-3">
        Select destination folder
      </p>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-1">
        {/* Root row */}
        <div
          className={clsx(
            'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm',
            selectedPath === '/'
              ? 'bg-violet-600/20 text-violet-300'
              : 'text-gray-300 hover:bg-gray-700'
          )}
          onClick={() => setSelectedPath('/')}
        >
          <HardDrive size={14} className="flex-shrink-0" />
          <span>My Drive</span>
        </div>

        {/* Folder tree */}
        {tree &&
          tree.children.map((node) => (
            <MoveToTreeNode
              key={node.id}
              node={node}
              depth={1}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
              excludeId={entryType === 'folder' ? entryIds[0] : undefined}
            />
          ))}
      </div>
      {selectedPath !== '/' && (
        <p className="mt-2 text-xs text-gray-500 truncate">
          Moving to: <span className="text-violet-400">{selectedPath}</span>
        </p>
      )}
    </Modal>
  )
}
