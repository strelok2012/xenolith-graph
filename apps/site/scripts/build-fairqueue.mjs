// Build the fairqueue priority-queue demo SPA (apps/fairqueue-demo) and drop its static output into
// the site's public/ so it ships with the docs site at /xenolith-graph/fairqueue/. Run before
// `astro build` (Astro copies public/ verbatim into dist/). The SPA's vite base is set to that
// sub-path. Mirrors build-react-demos.mjs.
import { execSync } from 'node:child_process'
import { rmSync, cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')
const demoDist = resolve(repoRoot, 'apps', 'fairqueue-demo', 'dist')
const out = resolve(here, '..', 'public', 'fairqueue')

// Run vite directly (NOT the package's `build`, which prefixes `tsc -b`). vite resolves @xenolith/*
// via aliases to each package's src, so no built .d.ts/dist is required — which the CI build-site
// job (packages unbuilt) doesn't have. Typecheck stays in the `test` job.
console.log('[fairqueue] building @xenolith/fairqueue-demo (vite)…')
execSync('pnpm --filter @xenolith/fairqueue-demo exec vite build', { stdio: 'inherit', cwd: repoRoot })

rmSync(out, { recursive: true, force: true })
cpSync(demoDist, out, { recursive: true })
console.log(`[fairqueue] copied → ${out}`)
