import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../shared/Modal'
import { Input } from '../shared/Input'
import { Button } from '../shared/Button'
import { useFilesStore } from '../../store/files.store'
import { useTreeStore } from '../../store/tree.store'

interface NewFolderModalProps {
  isOpen: boolean
  onClose: () => void
}

export function NewFolderModal({ isOpen, onClose }: NewFolderModalProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const currentPath = useFilesStore((s) => s.currentPath)
  const entries = useFilesStore((s) => s.entries)
  const refreshFolder = useFilesStore((s) => s.refreshFolder)
  const loadTree = useTreeStore((s) => s.loadTree)

  const validate = (value: string): string => {
    if (!value.trim()) return 'Folder name is required'
    if (value.includes('/')) return 'Folder name cannot contain /'
    const exists = entries.some(
      (e) => e.type === 'folder' && e.name.toLowerCase() === value.trim().toLowerCase()
    )
    if (exists) return 'A folder with this name already exists'
    return ''
  }

  const handleCreate = async () => {
    const validationError = validate(name)
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    try {
      const folderPath =
        currentPath === '/'
          ? `/${name.trim()}`
          : `${currentPath}/${name.trim()}`
      const result = await window.televault.folders.create(folderPath)
      if (!result.success) throw new Error(result.error)
      toast.success('Folder created')
      setName('')
      setError('')
      onClose()
      await refreshFolder()
      await loadTree()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create folder')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setError('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Folder"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button size="sm" loading={loading} onClick={handleCreate}>
            Create
          </Button>
        </div>
      }
    >
      <Input
        label="Folder name"
        value={name}
        onChange={(e) => {
          setName(e.target.value)
          if (error) setError(validate(e.target.value))
        }}
        placeholder="My Folder"
        autoFocus
        error={error}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
      />
    </Modal>
  )
}
