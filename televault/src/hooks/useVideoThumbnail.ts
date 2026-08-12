import { useState, useEffect } from 'react'
import { extractVideoFrame } from '../utils/videoThumbnail'

export function useVideoThumbnail(
  fileId: string,
  mimeType: string | null,
  existingThumbnailPath: string | null
) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isVideo = mimeType?.startsWith('video/')

  useEffect(() => {
    if (!isVideo) return

    // Use existing thumbnail if already generated
    if (existingThumbnailPath) {
      const filename = existingThumbnailPath.split(/[/\\]/).pop()
      setThumbUrl(`tvfile://thumbnails/${filename}`)
      return
    }

    // No cached thumbnail — generate from video
    let cancelled = false
    setLoading(true)

    async function generate() {
      try {
        // Download video to temp cache
        const cachedPath = await window.televault.files.downloadToTemp(fileId)
        if (cancelled) return

        const filename = cachedPath.split(/[/\\]/).pop()
        const videoUrl = `tvfile://preview-cache/${filename}`

        const dataUrl = await extractVideoFrame(videoUrl, 1.0)
        if (cancelled || !dataUrl) return

        setThumbUrl(dataUrl)

        // Save thumbnail via IPC for future use
        window.televault.files.saveThumbnail(fileId, dataUrl).catch(console.error)

      } catch (err) {
        console.error('[videoThumb] failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    generate()
    return () => { cancelled = true }
  }, [fileId, isVideo, existingThumbnailPath])

  return { thumbUrl, loading }
}
