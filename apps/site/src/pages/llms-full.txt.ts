// `/llms-full.txt` — every public guide concatenated into a single plain-text dump per
// https://llmstxt.org. English only by design — LLMs translate fine on the fly and a
// multi-language dump would 3× the size without helping retrieval.

import type { APIRoute } from 'astro'
import { EXAMPLES, CATEGORY_ORDER } from '../examples/manifest.ts'
import { TOOLS } from '@xenolith/mcp-server'

const SITE = 'https://xenolithengine.github.io'
const BASE = '/xenolith-graph'

// Build-time inclusion of EN guide sources only. Russian/Chinese intentionally excluded.
const RAW = import.meta.glob('../content/docs/guides/*.mdx', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

// Curated reading order — quickstart first, then deeper topics.
const ORDER = ['install', 'init', 'api', 'widgets', 'macros-templates', 'theme', 'save-export', 'events-commands', 'plugins']

interface Doc { slug: string; title: string; description: string; body: string }

function parse(slug: string, raw: string): Doc {
  // Strip frontmatter delimited by --- … ---
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw)
  const fm = m ? m[1] : ''
  const body = (m ? m[2] : raw).trim()
  const title = /^title:\s*(.+)$/m.exec(fm)?.[1]?.replace(/^['"]|['"]$/g, '') ?? slug
  const description = /^description:\s*(.+)$/m.exec(fm)?.[1]?.replace(/^['"]|['"]$/g, '') ?? ''
  return { slug, title, description, body }
}

function loadDocs(): Doc[] {
  const bySlug = new Map<string, Doc>()
  for (const [path, raw] of Object.entries(RAW)) {
    const slug = path.split('/').pop()!.replace(/\.mdx$/, '')
    bySlug.set(slug, parse(slug, raw))
  }
  return ORDER.map((s) => bySlug.get(s)).filter((d): d is Doc => !!d)
}

function header(): string {
  return [
    '# XenolithGraph — full reference (LLM-friendly dump)',
    '',
    '> Open-source embeddable node-graph editor for the web. WebGL (PIXI v8), opinionated design (Xen + Liquid Glass), typed pins, in-node widgets, framework adapters, and an MCP server for AI-driven graph construction. This file concatenates every public guide for one-shot ingestion.',
    '',
    `Canonical site: ${SITE}${BASE}/`,
    `Live examples:  ${SITE}${BASE}/examples/`,
    `MCP server:     https://github.com/XenolithEngine/xenolith-graph/tree/main/packages/mcp-server`,
    '',
    '---',
    '',
  ].join('\n')
}

function mcpSection(): string {
  const lines: string[] = []
  lines.push('# MCP tool catalogue')
  lines.push('')
  lines.push('The `@xenolith/mcp-server` package exposes these tools to any MCP client (Claude Desktop, Cursor, etc). Mutations go through the editor command bus, so undo/redo and events fire normally.')
  lines.push('')
  for (const [name, def] of Object.entries(TOOLS)) {
    lines.push(`## ${name}`)
    lines.push('')
    lines.push(def.description)
    lines.push('')
  }
  lines.push('Full JSON Schemas: ' + `${SITE}${BASE}/api/mcp-tools.json`)
  lines.push('')
  lines.push('---')
  lines.push('')
  return lines.join('\n')
}

function examplesSection(): string {
  const lines: string[] = []
  lines.push('# Examples gallery')
  lines.push('')
  lines.push('Every example below is a live, interactive demo with a React island + full source. Visit the URL for the running app.')
  lines.push('')
  for (const cat of CATEGORY_ORDER) {
    const items = EXAMPLES.filter((e) => e.category === cat)
    if (items.length === 0) continue
    lines.push(`## ${cat}`)
    lines.push('')
    for (const e of items) {
      lines.push(`- **${e.title}** — ${e.blurb}`)
      lines.push(`  ${SITE}${BASE}/examples/${e.id}/`)
    }
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  return lines.join('\n')
}

function render(): string {
  const out: string[] = [header(), mcpSection(), examplesSection()]
  for (const d of loadDocs()) {
    out.push(`# ${d.title}`)
    out.push('')
    if (d.description) { out.push(`> ${d.description}`); out.push('') }
    out.push(d.body)
    out.push('')
    out.push('---')
    out.push('')
  }
  return out.join('\n')
}

export const GET: APIRoute = () =>
  new Response(render(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
