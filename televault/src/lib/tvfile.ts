/** Convert an absolute thumbnail path to a tvfile:// URL served by the main process. */
export function toThumbnailUrl(thumbnailPath: string | null | undefined): string | null {
  if (!thumbnailPath) return null
  const filename = thumbnailPath.split(/[/\\]/).pop()
  if (!filename) return null
  return `tvfile://thumbnails/${filename}`
}

/** Convert an absolute preview-cache path to a tvfile:// URL. */
export function toPreviewUrl(cachedPath: string): string {
  const filename = cachedPath.split(/[/\\]/).pop()
  return `tvfile://preview-cache/${filename}`
}
