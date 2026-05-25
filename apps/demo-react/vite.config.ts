import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const pkgSrc = (name: string): string => resolve(here, '..', '..', 'packages', name, 'src', 'index.ts')

// Resolve workspace packages to their TS sources so HMR sees edits without a dist rebuild.
// On `build` the app is emitted under the docs-site sub-path (it ships inside apps/site/public);
// dev stays at '/' so the port-5180 server and Playwright keep working.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/xenolith-graph/react-demos/' : '/',
  plugins: [react()],
  server: { port: 5180 },
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  resolve: {
    alias: [
      { find: '@xenolith/core', replacement: pkgSrc('core') },
      { find: '@xenolith/render-pixi', replacement: pkgSrc('render-pixi') },
      { find: '@xenolith/editor', replacement: pkgSrc('editor') },
      { find: '@xenolith/adapter-core', replacement: pkgSrc('adapter-core') },
      { find: '@xenolith/react', replacement: resolve(here, '..', '..', 'packages', 'react', 'src', 'index.tsx') },
      { find: '@xenolith/theme-xen', replacement: pkgSrc('theme-xen') },
      { find: '@xenolith/theme-liquid-glass', replacement: pkgSrc('theme-liquid-glass') },
    ],
  },
}))
