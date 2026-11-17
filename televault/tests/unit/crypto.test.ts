import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  encryptBuffer,
  encryptFile,
  IV_LENGTH,
  TAG_LENGTH,
} from '../../core/crypto/encrypt'
import { decryptBuffer, decryptFile } from '../../core/crypto/decrypt'

const KEY = Buffer.from('11'.repeat(32), 'hex')
const WRONG_KEY = Buffer.from('22'.repeat(32), 'hex')

describe('AES-256-GCM crypto', () => {
  it('round-trips a buffer and uses the documented frame layout', () => {
    const plain = Buffer.from('tele-vault contents')
    const enc = encryptBuffer(plain, KEY)
    expect(enc.length).toBe(IV_LENGTH + TAG_LENGTH + plain.length)
    expect(decryptBuffer(enc, KEY)).toEqual(plain)
  })

  it('uses a fresh random IV for every encryption', () => {
    const plain = Buffer.from('same bytes')
    const a = encryptBuffer(plain, KEY)
    const b = encryptBuffer(plain, KEY)
    expect(a.subarray(0, IV_LENGTH)).not.toEqual(b.subarray(0, IV_LENGTH))
    expect(a).not.toEqual(b)
  })

  it('fails to decrypt with the wrong key', () => {
    const enc = encryptBuffer(Buffer.from('secret'), KEY)
    expect(() => decryptBuffer(enc, WRONG_KEY)).toThrow()
  })

  it('detects ciphertext tampering', () => {
    const enc = encryptBuffer(Buffer.from('secret'), KEY)
    enc[enc.length - 1] ^= 0x01
    expect(() => decryptBuffer(enc, KEY)).toThrow()
  })

  it('detects auth-tag tampering', () => {
    const enc = encryptBuffer(Buffer.from('secret'), KEY)
    enc[IV_LENGTH] ^= 0x01
    expect(() => decryptBuffer(enc, KEY)).toThrow()
  })

  it('round-trips a file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-crypto-'))
    try {
      const src = path.join(dir, 'plain.bin')
      const encPath = path.join(dir, 'enc.bin')
      const out = path.join(dir, 'out.bin')
      const data = Buffer.alloc(8 * 1024 + 37, 0xa5)
      fs.writeFileSync(src, data)

      await encryptFile(src, encPath, KEY)
      await decryptFile(encPath, out, KEY)

      expect(fs.readFileSync(out)).toEqual(data)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
