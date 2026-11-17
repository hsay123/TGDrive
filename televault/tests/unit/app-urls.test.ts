import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveRendererHtml,
  toFileUrl,
  toTvFileUrl,
} from '../../electron/app-urls'

// Deliberately use win32 semantics so the packaged Windows behaviour is
// verified on every CI runner, not just the Windows one.
const WIN = path.win32
const MAIN_DIR =
  'D:\\a\\TGDrive\\TGDrive\\televault\\release\\win-unpacked\\resources\\app.asar\\dist-electron\\electron'

describe('packaged URL construction (path.win32)', () => {
  it('resolves the renderer entry relative to the compiled main module', () => {
    expect(resolveRendererHtml(MAIN_DIR, WIN)).toBe(
      'D:\\a\\TGDrive\\TGDrive\\televault\\release\\win-unpacked\\resources\\app.asar\\dist\\index.html'
    )
  })

  it('builds a file URL with the drive letter in the path, not the host', () => {
    const html = resolveRendererHtml(MAIN_DIR, WIN)
    expect(toFileUrl(html)).toBe(
      'file:///D:/a/TGDrive/TGDrive/televault/release/win-unpacked/resources/app.asar/dist/index.html'
    )
    const parsed = new URL(toFileUrl(html))
    expect(parsed.protocol).toBe('file:')
    expect(parsed.host).toBe('')
    expect(parsed.pathname).toBe(
      '/D:/a/TGDrive/TGDrive/televault/release/win-unpacked/resources/app.asar/dist/index.html'
    )
  })

  it('percent-encodes spaces and URL-significant characters', () => {
    expect(toFileUrl('D:\\My Videos\\clip #1.mp4')).toBe(
      'file:///D:/My%20Videos/clip%20%231.mp4'
    )
  })

  it('builds tvfile URLs from Windows paths using only the basename', () => {
    expect(
      toTvFileUrl(
        'thumbnails',
        'C:\\Users\\Alice\\AppData\\Roaming\\TeleVault\\thumbnails\\a b.png'
      )
    ).toBe('tvfile://thumbnails/a%20b.png')
    expect(
      toTvFileUrl('avatars', '/home/user/.config/TeleVault/avatars/u#1.jpg')
    ).toBe('tvfile://avatars/u%231.jpg')
  })
})
