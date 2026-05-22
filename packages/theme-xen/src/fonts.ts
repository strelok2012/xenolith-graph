interface FontVariant {
  weight: number
  style: 'normal' | 'italic'
  file: string
}

const VARIANTS: readonly FontVariant[] = [
  { weight: 400, style: 'normal', file: 'Inter-Regular.woff2' },
  { weight: 600, style: 'normal', file: 'Inter-SemiBold.woff2' },
  { weight: 700, style: 'normal', file: 'Inter-Bold.woff2' },
]

let loadPromise: Promise<void> | null = null

/**
 * Register Inter (Regular / SemiBold / Bold) with the document's font set from the WOFF2 files
 * shipped inside this package. Call once at application start, before rendering any text.
 *
 * Bundlers that understand `new URL(..., import.meta.url)` (Vite ≥ 4, webpack 5, esbuild, Rollup
 * with `@rollup/plugin-url`) emit the WOFF2 as a static asset and rewrite the URL. No external
 * CDN is contacted; the fonts ride in the npm package.
 *
 * Subsequent calls return the same promise — safe to invoke multiple times.
 *
 * In non-DOM environments (Node, SSR) this resolves immediately as a no-op.
 */
export function loadXenFonts(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return Promise.resolve()
  }
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    await Promise.all(
      VARIANTS.map(async ({ weight, style, file }) => {
        const url = new URL(`./fonts/${file}`, import.meta.url).href
        const face = new FontFace('Inter', `url(${url}) format("woff2")`, {
          weight: String(weight),
          style,
          display: 'swap',
        })
        await face.load()
        // FontFaceSet extends Set<FontFace> per spec but the TS DOM lib doesn't always expose
        // `.add`; cast to a minimal shape.
        ;(document.fonts as unknown as { add(f: FontFace): void }).add(face)
      }),
    )
    // `face.load()` resolves when the binary is available, but Canvas2D text measurement only
    // picks up the new face after `document.fonts.ready` resolves. Without this await PIXI Text
    // can fall back to the next family in the list during the first measure pass.
    await document.fonts.ready
  })()

  return loadPromise
}
