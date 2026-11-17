import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'core'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
  // Unit tests never render CSS. Provide an inline PostCSS config so Vite does
  // not try to load the ESM postcss.config.js, which Electron's Node 20 cannot parse.
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    clearMocks: true,
    testTimeout: 15000,
  },
})
