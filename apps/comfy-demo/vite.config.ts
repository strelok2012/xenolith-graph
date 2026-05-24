import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkgSrc = (name: string): string =>
  resolve(here, '..', '..', 'packages', name, 'src', 'index.ts')

// Resolve workspace packages to their TS sources for instant HMR (mirrors the playground).
export default defineConfig({
  server: { port: 5174 },
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  resolve: {
    alias: [
      { find: '@xenolith/core',               replacement: pkgSrc('core') },
      { find: '@xenolith/render-pixi',         replacement: pkgSrc('render-pixi') },
      { find: '@xenolith/editor',              replacement: pkgSrc('editor') },
      { find: '@xenolith/theme-xen',           replacement: pkgSrc('theme-xen') },
      { find: '@xenolith/theme-liquid-glass',  replacement: pkgSrc('theme-liquid-glass') },
    ],
  },
})
