import { describe, expect, it } from 'vitest'
import { permanentDeleteFailureMessage } from '../../electron/ipc/permanent-delete-error'

describe('permanent delete failure message', () => {
  it('warns that a partial Telegram deletion may have left the file incomplete', () => {
    const message = permanentDeleteFailureMessage('FloodWaitError')

    expect(message).toContain('Delete permanently failed: FloodWaitError')
    expect(message).toContain('Some Telegram messages may already have been deleted')
    expect(message).toContain('the file may be incomplete')
    expect(message).toContain('still in Trash and will be retried')
    expect(message).not.toContain('Nothing was removed')
  })
})
