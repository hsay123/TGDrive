import crypto from 'crypto'
import fs from 'fs'
import { pipeline } from 'stream/promises'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

export function encryptBuffer(buffer: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

export async function encryptFile(
  sourcePath: string,
  destPath: string,
  key: Buffer
): Promise<void> {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  // File layout is IV || TAG || CIPHERTEXT (see decryptBuffer). Reserve the
  // header with a placeholder tag first, stream ciphertext after it, then
  // overwrite the placeholder with the real GCM tag once the cipher is done.
  await fs.promises.writeFile(destPath, Buffer.concat([iv, Buffer.alloc(TAG_LENGTH)]))
  await pipeline(
    fs.createReadStream(sourcePath),
    cipher,
    fs.createWriteStream(destPath, { flags: 'a' })
  )

  const tag = cipher.getAuthTag()
  const handle = await fs.promises.open(destPath, 'r+')
  try {
    await handle.write(tag, 0, TAG_LENGTH, IV_LENGTH)
  } finally {
    await handle.close()
  }
}

export { IV_LENGTH, TAG_LENGTH, ALGORITHM }
