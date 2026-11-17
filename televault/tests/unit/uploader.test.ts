import { describe, expect, it, vi } from 'vitest'

const { sendFile } = vi.hoisted(() => ({ sendFile: vi.fn() }))

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/tv-test-uploader-userdata' } }))
// sharp ships ESM with import attributes that Electron 29's V8 cannot parse when
// Vite externalizes it. Thumbnails are out of scope for these upload tests.
vi.mock('sharp', () => ({ default: {} }))
vi.mock('../../core/telegram/client', () => ({
  getClient: () => ({ sendFile }),
  getSetting: () => undefined,
}))
vi.mock('../../core/telegram/channels', () => ({
  getChannelEntity: async () => ({ id: 'storage-entity' }),
  getChannelId: async () => 'storage-channel',
}))
vi.mock('../../core/telegram/ratelimit', () => ({
  withRetry: (fn: () => unknown) => fn(),
  withEntityRetry: (fn: () => unknown) => fn(),
}))

import { uploadToTelegram } from '../../core/telegram/uploader'

const baseOptions = {
  purpose: 'storage' as const,
  caption: JSON.stringify({ tv: true, name: 'report.pdf', size: 4 }),
  buffer: Buffer.from('test'),
}

describe('uploader against a mocked Telegram client', () => {
  it('sends the file with the expected gramjs options and returns metadata', async () => {
    sendFile.mockResolvedValueOnce({ id: 4242 })

    const result = await uploadToTelegram(baseOptions)

    expect(sendFile).toHaveBeenCalledTimes(1)
    const [entity, options] = sendFile.mock.calls[0]
    expect(entity).toEqual({ id: 'storage-entity' })
    expect(options).toMatchObject({
      file: baseOptions.buffer,
      caption: baseOptions.caption,
      forceDocument: true,
      workers: 16,
      partSizeKb: 512,
    })
    expect(result).toEqual({
      messageId: 4242,
      channelId: 'storage-channel',
      size: 4,
      caption: baseOptions.caption,
    })
  })

  it('maps gramjs 0..1 progress to 0..100 percent', async () => {
    sendFile.mockResolvedValueOnce({ id: 1 })
    const onProgress = vi.fn()

    await uploadToTelegram({ ...baseOptions, onProgress })

    const options = sendFile.mock.calls[0][1]
    options.progressCallback(0.5)
    expect(onProgress).toHaveBeenCalledWith(50, 50, 100)
  })

  it('propagates a Telegram send failure instead of swallowing it', async () => {
    sendFile.mockRejectedValueOnce(new Error('FloodWaitError'))
    await expect(uploadToTelegram(baseOptions)).rejects.toThrow('FloodWaitError')
  })
})
