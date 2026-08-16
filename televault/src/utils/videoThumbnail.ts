/**
 * Downloads a video to temp cache and extracts a frame.
 * Saves result to thumbnails dir and updates DB.
 * Returns a data URL or tvfile:// URL.
 */
export async function generateVideoThumbFromFile(
  fileId: string,
  mimeType: string | null
): Promise<string | null> {
  try {
    console.log('[thumb] starting generation for:', fileId)

    // 1. Download video to preview-cache
    const cachedPath = await window.televault.files.downloadToTemp(fileId)
    console.log('[thumb] downloaded to:', cachedPath)

    // 2. Build tvfile:// URL for the cached video
    const filename = cachedPath.split(/[/\\]/).pop()
    const videoUrl = `tvfile://preview-cache/${filename}`
    console.log('[thumb] video URL:', videoUrl)

    // 3. Extract frame using offscreen video + canvas
    const dataUrl = await extractVideoFrame(videoUrl)
    if (!dataUrl) {
      console.warn('[thumb] frame extraction returned null')
      return null
    }
    console.log('[thumb] frame extracted, dataUrl length:', dataUrl.length)

    // 4. Save to disk via IPC
    await window.televault.files.saveThumbnail(fileId, dataUrl)
    console.log('[thumb] saved to disk')

    return dataUrl

  } catch (err) {
    console.error('[thumb] generation error:', err)
    return null
  }
}

/**
 * Core: creates offscreen video element, seeks to 1s, captures canvas frame.
 */
export function extractVideoFrame(
  videoUrl: string,
  seekTime = 1.0
): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'

    const timeout = setTimeout(() => {
      console.warn('[thumb] timeout waiting for video')
      video.src = ''
      resolve(null)
    }, 15000)

    video.addEventListener('loadedmetadata', () => {
      console.log('[thumb] metadata loaded, duration:', video.duration,
        'size:', video.videoWidth, 'x', video.videoHeight)

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn('[thumb] video has no dimensions')
        clearTimeout(timeout)
        resolve(null)
        return
      }

      // Seek to 1s or 10% of duration, whichever is smaller
      video.currentTime = Math.min(seekTime, video.duration * 0.1, video.duration - 0.1)
    })

    video.addEventListener('seeked', () => {
      clearTimeout(timeout)
      console.log('[thumb] seeked to', video.currentTime)

      const maxW = 320, maxH = 180
      const ratio = Math.min(maxW / video.videoWidth, maxH / video.videoHeight, 1)
      const w = Math.round(video.videoWidth * ratio)
      const h = Math.round(video.videoHeight * ratio)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')

      if (!ctx) { clearTimeout(timeout); resolve(null); return }

      ctx.drawImage(video, 0, 0, w, h)

      // toDataURL can throw SecurityError if the canvas is tainted. Treat that
      // as a decode failure so the caller transitions to 'failed' — never hang.
      let dataUrl: string
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      } catch (err) {
        clearTimeout(timeout)
        console.error('[thumb] decode-failed: canvas.toDataURL threw:', err)
        video.src = ''
        resolve(null)
        return
      }
      video.src = ''
      resolve(dataUrl)
    })

    video.addEventListener('error', (e) => {
      clearTimeout(timeout)
      console.error('[thumb] video error:', video.error?.message, e)
      resolve(null)
    })

    console.log('[thumb] setting video.src =', videoUrl)
    video.src = videoUrl
    video.load()
  })
}
