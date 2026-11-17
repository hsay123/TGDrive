/** Categories served by the privileged `tvfile` protocol in the main process. */
export type TvFileCategory = 'thumbnails' | 'preview-cache' | 'avatars'

/**
 * Build a `tvfile://` URL from an absolute path or a bare filename.
 *
 * Always reduce to the basename (handling both Windows `\` and POSIX `/`) so a
 * stored Windows path can never leak separators or a drive letter into the URL,
 * and encode the filename so spaces and URL-significant characters are safe.
 */
export function tvFileUrl(category: TvFileCategory, filePath: string): string {
  const filename = filePath.replace(/\\/g, '/').split('/').pop()
  if (!filename) throw new Error(`tvFileUrl: empty filename for ${category}`)
  return `tvfile://${category}/${encodeURIComponent(filename)}`
}

/** Convert an absolute thumbnail path to a tvfile:// URL served by the main process. */
export function toThumbnailUrl(thumbnailPath: string | null | undefined): string | null {
  if (!thumbnailPath) return null
  return tvFileUrl('thumbnails', thumbnailPath)
}

/** Convert an absolute preview-cache path to a tvfile:// URL. */
export function toPreviewUrl(cachedPath: string): string {
  return tvFileUrl('preview-cache', cachedPath)
}
