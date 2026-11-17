/**
 * Generates the platform app icons from the source logo.
 *
 * The source logo is non-square (866x649), so it is centred onto a padded
 * square canvas rather than stretched — macOS icons in particular get
 * distorted badly if you feed a non-square PNG straight to electron-builder.
 *
 * Emits:
 *   build/icon.png   1024x1024  (Linux / generic)
 *   build/icon.ico   16..256    (Windows)
 *   build/icon.icns  32..1024   (macOS)
 *
 * Usage: npm run icons
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(root, 'src/assets/blacklogo.png')
const OUT = path.join(root, 'build')

const CANVAS = 1024 // master square size
const FILL = 0.78 // logo occupies 78% of the canvas, rest is transparent padding

/** Centre the logo on a transparent square canvas. */
async function makeSquare() {
  const meta = await sharp(SRC).metadata()
  const target = Math.round(CANVAS * FILL)
  const scale = target / Math.max(meta.width, meta.height)

  const resized = await sharp(SRC)
    .resize({
      width: Math.round(meta.width * scale),
      height: Math.round(meta.height * scale),
      fit: 'inside',
    })
    .png()
    .toBuffer()

  return sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer()
}

/** Windows .ico — Vista+ format, PNG payloads are valid inside an ICO. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

async function buildIco(square) {
  const images = await Promise.all(
    ICO_SIZES.map(async (size) => ({
      size,
      data: await sharp(square).resize(size, size).png().toBuffer(),
    }))
  )

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const dir = Buffer.alloc(16 * images.length)
  let offset = header.length + dir.length

  images.forEach((img, i) => {
    const at = i * 16
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, at + 0) // 0 means 256
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, at + 1)
    dir.writeUInt8(0, at + 2) // palette size
    dir.writeUInt8(0, at + 3) // reserved
    dir.writeUInt16LE(1, at + 4) // colour planes
    dir.writeUInt16LE(32, at + 6) // bits per pixel
    dir.writeUInt32LE(img.data.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += img.data.length
  })

  return Buffer.concat([header, dir, ...images.map((i) => i.data)])
}

/** macOS .icns — typed chunks, each a bare PNG. */
const ICNS_CHUNKS = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32], // 16pt @2x
  ['ic12', 64], // 32pt @2x
  ['ic13', 256], // 128pt @2x
  ['ic14', 512], // 256pt @2x
]

async function buildIcns(square) {
  const parts = []
  for (const [type, size] of ICNS_CHUNKS) {
    const png = await sharp(square).resize(size, size).png().toBuffer()
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    parts.push(header, png)
  }

  const body = Buffer.concat(parts)
  const magic = Buffer.alloc(8)
  magic.write('icns', 0, 4, 'ascii')
  magic.writeUInt32BE(body.length + 8, 4)

  return Buffer.concat([magic, body])
}

const square = await makeSquare()
await mkdir(OUT, { recursive: true })

await writeFile(path.join(OUT, 'icon.png'), square)
await writeFile(path.join(OUT, 'icon.ico'), await buildIco(square))
await writeFile(path.join(OUT, 'icon.icns'), await buildIcns(square))

console.log('Wrote build/icon.png, build/icon.ico, build/icon.icns')
