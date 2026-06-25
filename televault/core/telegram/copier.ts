/**
 * copier.ts — Copy multiple files to a new destination folder.
 *
 * Downloads each source file's chunks from Telegram into a temp path,
 * then re-uploads them to the destination folder as new DB records.
 * This preserves encryption settings and generates a fresh fileId.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { getFileById } from '../db/files.db'
import { getChunksByFileId } from '../db/chunks.db'
import { downloadFile } from './downloader'
import { uploadFile } from './uploader'

/**
 * Copy a single file by downloading it to a temp path and re-uploading
 * it into the destination folder.
 */
async function copySingleFile(fileId: string, destFolderPath: string): Promise<void> {
  const file = getFileById(fileId)
  if (!file) throw new Error(`File not found: ${fileId}`)

  // Ensure we have chunks to copy
  const chunks = getChunksByFileId(fileId)
  if (chunks.length === 0) throw new Error(`File has no content chunks: ${fileId}`)

  const tempPath = path.join(os.tmpdir(), `televault-copy-${uuidv4()}${path.extname(file.name)}`)

  try {
    // Download the original file to a temporary path
    await downloadFile(fileId, tempPath)

    // Build the destination path inside the target folder
    const normalizedFolder = destFolderPath.endsWith('/')
      ? destFolderPath
      : `${destFolderPath}/`
    const destFilePath = `${normalizedFolder}${file.name}`

    // Re-upload to the destination (inherits current encryption setting)
    await uploadFile(tempPath, destFilePath)
  } finally {
    // Always clean up the temp file
    await fs.promises.unlink(tempPath).catch(() => {})
  }
}

/**
 * Copy multiple files to a destination folder.
 * Processes files sequentially to avoid hammering Telegram rate limits.
 *
 * @param fileIds   Array of source file IDs to copy
 * @param destPath  Virtual folder path to copy files into (e.g. "/Documents/Copies")
 */
export async function copyMultiple(fileIds: string[], destPath: string): Promise<void> {
  for (const fileId of fileIds) {
    await copySingleFile(fileId, destPath)
  }
}
