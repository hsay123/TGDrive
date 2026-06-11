import { Plus } from 'lucide-react'
import { FolderNode } from './FolderNode'
import { NewFolderModal } from './NewFolderModal'
import { useTreeStore } from '../../store/tree.store'
import { useUIStore } from '../../store/ui.store'

export function FolderTree() {
  const tree = useTreeStore((s) => s.tree)
  const activeModal = useUIStore((s) => s.activeModal)
  const closeModal = useUIStore((s) => s.closeModal)
  const openModal = useUIStore((s) => s.openModal)

  const hasChildren = tree?.children && tree.children.length > 0

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1">
      {/* No folders yet */}
      {!hasChildren && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-xs text-gray-600">No folders yet</p>
          <button
            onClick={() => openModal('new-folder')}
            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Create folder
          </button>
        </div>
      )}

      {/* Folder nodes */}
      {tree?.children.map((child) => (
        <FolderNode key={child.id} folder={child} depth={0} />
      ))}

      <NewFolderModal
        isOpen={activeModal === 'new-folder'}
        onClose={closeModal}
      />
    </div>
  )
}
