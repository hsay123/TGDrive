import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function rewriteFileCard(): Plugin {
  return {
    name: 'rewrite-filecard-to-measure-wrapper',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (
        source === './FileCard' &&
        importer &&
        importer.replace(/\\/g, '/').includes('files/FileGrid')
      ) {
        const resolved = await this.resolve(source, importer, { skipSelf: true })
        if (resolved) {
          return path.resolve(__dirname, './FileCard.measure.tsx')
        }
      }
      return null
    },
  }
}

// Use React's profiling build so <Profiler> onRender reports in production.
const nodeModules = path.resolve(__dirname, '../../node_modules')

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), rewriteFileCard()],
  resolve: {
    alias: [
      { find: /^react-dom$/, replacement: path.join(nodeModules, 'react-dom/profiling') },
      { find: /^react-dom\/client$/, replacement: path.join(nodeModules, 'react-dom/profiling') },
      { find: '@', replacement: path.resolve(__dirname, '../../src') },
      { find: '@core', replacement: path.resolve(__dirname, '../../core') },
      { find: '@electron', replacement: path.resolve(__dirname, '../../electron') },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: { port: 5187, strictPort: true },
})