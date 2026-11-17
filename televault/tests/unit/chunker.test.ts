import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// getChunks() resolves its temp directory through app.getPath('userData').
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/tv-test-chunker-userdata' },
}))

import {
  CHUNK_SIZE,
  assembleChunks,
  getChunks,
  needsChunking,
  needsChunkingBySize,
} from '../../core/fs/chunker'

let dir: string

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-chunker-'))
  fs.mkdirSync('/tmp/tv-test-chunker-userdata', { recursive: true })
})

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync('/tmp/tv-test-chunker-userdata', { recursive: true, force: true })
})

describe('chunking', () => {
  it('uses 512 MiB chunks', () => {
    expect(CHUNK_SIZE).toBe(512 * 1024 * 1024)
  })

  it('treats exactly 512 MiB as a single chunk', () => {
    expect(needsChunkingBySize(CHUNK_SIZE)).toBe(false)
    expect(needsChunkingBySize(CHUNK_SIZE + 1)).toBe(true)
  })

  it('returns one descriptor using the original path for a small file', async () => {
    const file = path.join(dir, 'small.txt')
    fs.writeFileSync(file, 'hello televault')

    const chunks = getChunks(file)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ index: 0, start: 0, end: 14, size: 15 })
    expect(await chunks[0].createTempFile()).toBe(file)
    expect(needsChunking(file)).toBe(false)
  })

  it('splits a sparse >1 GiB file into correctly ranged descriptors', () => {
    const file = path.join(dir, 'large.bin')
    const size = CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2) + 10
    const fd = fs.openSync(file, 'w')
    fs.ftruncateSync(fd, size)
    fs.closeSync(fd)

    const chunks = getChunks(file)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ index: 0, start: 0, end: CHUNK_SIZE - 1, size: CHUNK_SIZE })
    expect(chunks[1]).toMatchObject({
      index: 1,
      start: CHUNK_SIZE,
      end: size - 1,
      size: size - CHUNK_SIZE,
    })
    expect(chunks.reduce((n, c) => n + c.size, 0)).toBe(size)
    expect(needsChunking(file)).toBe(true)
  })

  it('assembles chunks in index order', async () => {
    const parts = [
      { name: 'c', text: 'CCC' },
      { name: 'a', text: 'AAA' },
      { name: 'b', text: 'BBB' },
    ]
    const paths: Record<string, string> = {}
    for (const part of parts) {
      const p = path.join(dir, `part-${part.name}`)
      fs.writeFileSync(p, part.text)
      paths[part.name] = p
    }

    const dest = path.join(dir, 'assembled.txt')
    await assembleChunks(
      [
        { index: 2, path: paths.c, size: 3 },
        { index: 0, path: paths.a, size: 3 },
        { index: 1, path: paths.b, size: 3 },
      ],
      dest
    )
    expect(fs.readFileSync(dest, 'utf8')).toBe('AAABBBCCC')
  })
})
