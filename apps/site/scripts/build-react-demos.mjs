// Build the React adapter demo SPA (apps/demo-react) and drop its static output into the site's
// public/ so it ships with the docs site at /xenolith-graph/react-demos/. Run before `astro build`
// (Astro copies public/ verbatim into dist/). The SPA's vite base is set to that sub-path.
import { execSync } from 'node:child_process'
import { rmSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')
const demoDist = resolve(repoRoot, 'apps', 'demo-react', 'dist')
const out = resolve(here, '..', 'public', 'react-demos')

console.log('[react-demos] building @xenolith/demo-react…')
execSync('pnpm --filter @xenolith/demo-react build', { stdio: 'inherit', cwd: repoRoot })

rmSync(out, { recursive: true, force: true })
cpSync(demoDist, out, { recursive: true })
console.log(`[react-demos] copied → ${out}`)
