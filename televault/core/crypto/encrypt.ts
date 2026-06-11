import crypto from 'crypto'
import fs from 'fs'

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

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(destPath)

    output.on('error', reject)
    cipher.on('error', reject)

    output.write(iv)
    output.write(Buffer.alloc(TAG_LENGTH))

    const input = fs.createReadStream(sourcePath)
    input.on('error', reject)

    input.pipe(cipher)

    cipher.on('end', () => {
      const tag = cipher.getAuthTag()
      fs.open(destPath, 'r+', (openErr, fd) => {
        if (openErr) {
          reject(openErr)
          return
        }

        fs.write(fd, tag, 0, TAG_LENGTH, IV_LENGTH, (writeErr) => {
          fs.close(fd, (closeErr) => {
            output.end(() => {
              if (writeErr) {
                reject(writeErr)
              } else if (closeErr) {
                reject(closeErr)
              } else {
                resolve()
              }
            })
          })
        })
      })
    })
  })
}

export { IV_LENGTH, TAG_LENGTH, ALGORITHM }
