export interface IpcResult<T> {
  success: boolean
  data?: T
  error?: string
}

export async function ipcResult<T>(
  fn: () => Promise<T> | T
): Promise<IpcResult<T>> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[IPC Error]', message)
    return { success: false, error: message }
  }
}
