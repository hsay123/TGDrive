import { describe, expect, it } from 'vitest'
import { mergeMacUpdateYaml } from '../../scripts/merge-mac-update-metadata.mjs'

const x64 = `version: 0.1.0-rc.1
files:
  - url: TeleVault-macos-x64.zip
    sha512: X64ZIPHASH
    size: 152412323
  - url: TeleVault-macos-x64.dmg
    sha512: X64DMGHASH
    size: 157002697
path: TeleVault-macos-x64.zip
sha512: X64ZIPHASH
releaseDate: '2026-11-20T21:19:00.000Z'
`

const arm64 = `version: 0.1.0-rc.1
files:
  - url: TeleVault-macos-arm64.zip
    sha512: ARMZIPHASH
    size: 145835538
  - url: TeleVault-macos-arm64.dmg
    sha512: ARMDMGHASH
    size: 150413075
path: TeleVault-macos-arm64.zip
sha512: ARMZIPHASH
releaseDate: '2026-11-20T21:18:00.000Z'
`

describe('mergeMacUpdateYaml', () => {
  it('lists both architectures in one manifest', () => {
    const merged = mergeMacUpdateYaml([x64, arm64])

    expect(merged.match(/^version:/gm)).toHaveLength(1)
    expect(merged).toContain('url: TeleVault-macos-x64.zip')
    expect(merged).toContain('url: TeleVault-macos-x64.dmg')
    expect(merged).toContain('url: TeleVault-macos-arm64.zip')
    expect(merged).toContain('url: TeleVault-macos-arm64.dmg')
    expect(merged.indexOf('macos-x64.zip')).toBeLessThan(merged.indexOf('macos-arm64.zip'))
    expect(merged).toContain("releaseDate: '2026-11-20T21:19:00.000Z'")
  })

  it('keeps one entry when the same url appears in both manifests', () => {
    const merged = mergeMacUpdateYaml([x64, x64])

    expect(merged.match(/url: TeleVault-macos-x64.zip/g)).toHaveLength(1)
  })

  it('refuses to merge manifests for different versions', () => {
    expect(() => mergeMacUpdateYaml([x64, arm64.replace('0.1.0-rc.1', '0.1.0')])).toThrow(
      /versions do not match/
    )
  })
})
