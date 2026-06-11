import type { IpcResult } from '../types'

export function useTelegram() {
  const call = async <T>(fn: () => Promise<IpcResult<T>>): Promise<T> => {
    const result = await fn()
    if (!result.success) {
      throw new Error(result.error ?? 'Unknown error')
    }
    return result.data as T
  }

  return { call }
}
