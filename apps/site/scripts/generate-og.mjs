// Generate an OG/Twitter card image (1200×630) for XenolithGraph using sharp.
// The card shows the logo, the brand wordmark, and a one-liner.

import { readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const LOGO = resolve(ROOT, 'src/assets/logo.png')
const OUT  = resolve(ROOT, 'public/og.png')

const W = 1200
const H = 630

const logoBuf = await readFile(LOGO)
const logoMeta = await sharp(logoBuf).metadata()
const logoSize = 360
const logoX = 96
const logoY = Math.round((H - logoSize) / 2)

// Pre-render the logo at logo size with drop-shadow.
const logoRendered = await sharp(logoBuf)
  .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()

const overlaySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#1A1A1A"/>
      <stop offset="100%" stop-color="#0F0F0F"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="0%" r="60%">
      <stop offset="0%"  stop-color="#D9CAA0" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#D9CAA0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#FFF7D7"/>
      <stop offset="48%" stop-color="#B09C5A"/>
      <stop offset="100%" stop-color="#FFF7D7"/>
    </linearGradient>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Tektur:wght@500;700&amp;family=Manrope:wght@500&amp;display=swap");
      .display { font-family: 'Tektur', 'Manrope', sans-serif; }
      .body    { font-family: 'Manrope', sans-serif; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(540, 200)">
    <text class="display" x="0" y="0" font-size="76" font-weight="700" fill="url(#gold)">XenolithGraph</text>
    <text class="display" x="0" y="56" font-size="22" font-weight="500" fill="rgba(255,255,255,0.66)" letter-spacing="0.04em">A polished node-graph editor for the web.</text>
    <text class="body"    x="0" y="120" font-size="20" fill="rgba(255,255,255,0.86)">One <tspan font-family="JetBrains Mono, monospace" fill="#D9CAA0">init('#app')</tspan> — and you have an editor.</text>
    <text class="body"    x="0" y="170" font-size="16" fill="rgba(255,255,255,0.50)">Drop-in PIXI v8 · Bundled Inter · Deep theming · Collapse / Expand · MIT</text>
  </g>
  <rect x="0" y="${H - 4}" width="${W}" height="4" fill="url(#gold)" opacity="0.6"/>
</svg>`)

await mkdir(resolve(ROOT, 'public'), { recursive: true })
await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
})
  .composite([
    { input: overlaySvg, top: 0, left: 0 },
    { input: logoRendered, top: logoY, left: logoX },
  ])
  .png({ compressionLevel: 9 })
  .toFile(OUT)

console.log(`✓ og.png written → ${OUT}`)
void logoMeta
