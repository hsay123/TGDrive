import crypto from 'crypto'
import fs from 'fs'
import { pipeline } from 'stream/promises'
import { ALGORITHM, IV_LENGTH, TAG_LENGTH } from './encrypt'

export function decryptBuffer(buffer: Buffer, key: Buffer): Buffer {
  const iv = buffer.subarray(0, IV_LENGTH)
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = buffer.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export async function decryptFile(
  sourcePath: string,
  destPath: string,
  key: Buffer
): Promise<void> {
  const fd = await fs.promises.open(sourcePath, 'r')
  const header = Buffer.alloc(IV_LENGTH + TAG_LENGTH)
  await fd.read(header, 0, IV_LENGTH + TAG_LENGTH, 0)
  await fd.close()

  const iv = header.subarray(0, IV_LENGTH)
  const tag = header.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const input = fs.createReadStream(sourcePath, {
    start: IV_LENGTH + TAG_LENGTH,
  })
  const output = fs.createWriteStream(destPath)

  await pipeline(input, decipher, output)
}
