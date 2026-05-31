// Generate the OG/Twitter card (1200×630) for XenolithGraph.
// The backdrop is a snapshot of the playground graph captured by capture-og-backdrop.mjs
// (run that once whenever the graph or theme changes, then commit the resulting image).
// We darken + cool-tint the backdrop, drop the wordmark on the right, and burn the slogan
// into the bottom-left for context.

import { readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const LOGO = resolve(ROOT, 'src/assets/logo.png')
const BACKDROP = resolve(ROOT, 'src/assets/og-backdrop.jpg')
const OUT = resolve(ROOT, 'public/og.png')

const W = 1200
const H = 630

const logoBuf = await readFile(LOGO)
const backdropBuf = await readFile(BACKDROP)

const logoSize = 220
const logoX = 96
const logoY = Math.round((H - logoSize) / 2)

// Backdrop: cover-fit the 1600×840 snapshot onto 1200×630, darken so the gold wordmark pops.
const backdropFitted = await sharp(backdropBuf)
  .resize(W, H, { fit: 'cover', position: 'centre' })
  .modulate({ brightness: 0.55 })
  .blur(0.3)
  .toBuffer()

const logoRendered = await sharp(logoBuf)
  .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()

// A directional dim from the right so the wordmark text reads on top of the graph snapshot.
const overlaySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="darken" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"  stop-color="#0A0A0A" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="#0A0A0A" stop-opacity="0.70"/>
      <stop offset="100%" stop-color="#0A0A0A" stop-opacity="0.86"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#FFF7D7"/>
      <stop offset="48%"  stop-color="#B09C5A"/>
      <stop offset="100%" stop-color="#FFF7D7"/>
    </linearGradient>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Tektur:wght@500;700&amp;family=Manrope:wght@400;500;600&amp;display=swap");
      .display { font-family: 'Tektur', 'Manrope', sans-serif; }
      .body    { font-family: 'Manrope', sans-serif; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#darken)"/>
  <g transform="translate(${logoX + logoSize + 64}, 190)">
    <text class="display" x="0" y="0" font-size="68" font-weight="700" fill="url(#gold)">XenolithGraph</text>
    <text class="display" x="0" y="48" font-size="20" font-weight="500" fill="rgba(255,255,255,0.66)" letter-spacing="0.06em">A POLISHED NODE-GRAPH EDITOR FOR THE WEB</text>
    <text class="body"    x="0" y="118" font-size="26" font-weight="500" fill="rgba(255,255,255,0.92)">Beautiful node editing. Built to embed.</text>
    <text class="body"    x="0" y="180" font-size="16" font-weight="400" fill="rgba(255,255,255,0.58)" letter-spacing="0.02em">Macros · Templates · Widgets · Auto-layout · Six framework adapters · MIT</text>
  </g>
  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#gold)" opacity="0.55"/>
</svg>`)

await mkdir(resolve(ROOT, 'public'), { recursive: true })
await sharp(backdropFitted)
  .composite([
    { input: overlaySvg, top: 0, left: 0 },
    { input: logoRendered, top: logoY, left: logoX },
  ])
  .png({ compressionLevel: 9 })
  .toFile(OUT)

console.log(`✓ og.png written → ${OUT}`)
