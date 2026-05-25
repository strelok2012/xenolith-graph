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

// Run vite directly (NOT the package's `build`, which prefixes `tsc -b`). Like the docs site itself,
// vite resolves @xenolith/* via aliases to each package's src — so no built .d.ts/dist is required,
// which the CI build-site job (packages unbuilt) doesn't have. Typecheck stays in the `test` job.
console.log('[react-demos] building @xenolith/demo-react (vite)…')
execSync('pnpm --filter @xenolith/demo-react exec vite build', { stdio: 'inherit', cwd: repoRoot })

rmSync(out, { recursive: true, force: true })
cpSync(demoDist, out, { recursive: true })
console.log(`[react-demos] copied → ${out}`)
