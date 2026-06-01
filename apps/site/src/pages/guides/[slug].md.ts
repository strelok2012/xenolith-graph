// `/guides/<slug>.md` — raw markdown body of any EN guide so an LLM can fetch a single topic
// without parsing the rendered Starlight HTML. Listed in `/llms.txt`. EN only.

import type { APIRoute } from 'astro'

const RAW = import.meta.glob('../../content/docs/guides/*.mdx', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

const bySlug = new Map<string, string>()
for (const [path, raw] of Object.entries(RAW)) {
  const slug = path.split('/').pop()!.replace(/\.mdx$/, '')
  bySlug.set(slug, raw)
}

export function getStaticPaths(): Array<{ params: { slug: string } }> {
  return [...bySlug.keys()].map((slug) => ({ params: { slug } }))
}

export const GET: APIRoute = ({ params }) => {
  const slug = String(params.slug)
  const raw = bySlug.get(slug)
  if (!raw) return new Response('not found', { status: 404 })
  // Strip the frontmatter delimiters and inject a real heading from the title.
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw)
  const fm = m ? m[1] : ''
  const body = (m ? m[2] : raw).trim()
  const title = /^title:\s*(.+)$/m.exec(fm)?.[1]?.replace(/^['"]|['"]$/g, '') ?? slug
  const description = /^description:\s*(.+)$/m.exec(fm)?.[1]?.replace(/^['"]|['"]$/g, '') ?? ''
  const out = description ? `# ${title}\n\n> ${description}\n\n${body}\n` : `# ${title}\n\n${body}\n`
  return new Response(out, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  })
}
