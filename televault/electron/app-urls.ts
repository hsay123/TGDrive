/**
 * Single place for turning filesystem paths into URLs.
 *
 * Hand-building a file URL as `'file://' + somePath` is wrong: on Windows
 * `file://D:\dir\file.html` parses `D:` as the URL *host* and loses the path,
 * which surfaces as a blank window at `file:///D:/`. Always go through the
 * WHATWG URL machinery instead.
 *
 * `toFileUrl` accepts both POSIX and Windows-style paths so the Windows
 * behaviour is unit-testable with `path.win32` on any host.
 */
import path from 'path'
import { pathToFileURL } from 'url'

/** Absolute path of the built renderer entry point. */
export function resolveRendererHtml(
  moduleDir: string,
  pathImpl: typeof path = path
): string {
  return pathImpl.resolve(moduleDir, '..', '..', 'dist', 'index.html')
}

/**
 * Convert an absolute path to a `file://` URL.
 *
 * On Windows the native implementation handles drive letters correctly. The
 * fallback is used by unit tests running on POSIX: a drive path is prefixed
 * with `/` so `pathToFileURL` emits `file:///D:/...` rather than treating the
 * path as relative.
 */
export function toFileUrl(filePath: string): string {
  if (!filePath) throw new Error('toFileUrl: empty path')
  if (process.platform === 'win32') return pathToFileURL(filePath).toString()

  const slashed = filePath.replace(/\\/g, '/')
  const urlPath = /^[A-Za-z]:/.test(slashed) ? `/${slashed}` : slashed
  return pathToFileURL(urlPath).toString()
}

/** Build a URL for a file served by the privileged `tvfile` protocol. */
export function toTvFileUrl(
  category: 'thumbnails' | 'preview-cache' | 'avatars',
  filePath: string
): string {
  const filename = path.basename(filePath).replace(/\\/g, '/').split('/').pop()
  if (!filename) throw new Error('toTvFileUrl: empty filename')
  return `tvfile://${category}/${encodeURIComponent(filename)}`
}
