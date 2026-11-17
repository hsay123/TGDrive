import { useCallback, useEffect, useState } from 'react'
import type { UpdateStatus } from '../types'

export interface UpdateState {
  phase: UpdateStatus['phase']
  version?: string
  percent?: number
  message?: string
}

const INITIAL: UpdateState = { phase: 'idle' }

/**
 * Subscribes to the single `update:status` channel exposed by the preload
 * bridge. The main process also runs its own check ~5s after launch, so this
 * hook can be mounted anywhere and will simply observe it.
 */
export function useUpdate() {
  const [state, setState] = useState<UpdateState>(INITIAL)

  useEffect(() => {
    return window.televault.updater.onStatus((status) => {
      setState({
        phase: status.phase,
        version: status.version,
        percent: status.percent,
        message: status.message,
      })
    })
  }, [])

  const check = useCallback(async () => {
    const r = await window.televault.updater.check()
    if (!r.success) {
      setState({ phase: 'error', message: r.error ?? 'Update check failed' })
    }
  }, [])

  const download = useCallback(async () => {
    const r = await window.televault.updater.download()
    if (!r.success) {
      setState((s) => ({ ...s, phase: 'error', message: r.error ?? 'Download failed' }))
    }
  }, [])

  const install = useCallback(async () => {
    await window.televault.updater.install()
  }, [])

  return { ...state, check, download, install }
}
