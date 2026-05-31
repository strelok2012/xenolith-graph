// Vanilla example loader — one entry per id, lazy-imported so the bundle stays per-page.
// New vanilla demos: drop a file in ./vanilla/<id>.ts exporting `mount(target): Promise<dispose>`
// and add a row to MAP below. The site's per-example page picks the mount by id and listens for
// the `xeno:reset` event (the gallery's "Reset preview" button) to tear down + re-mount.

type Mount = (target: HTMLElement) => Promise<() => void>
const MAP: Record<string, () => Promise<{ mount: Mount }>> = {
  'auto-layout':   () => import('./vanilla/auto-layout.ts'),
  'nested-layout':    () => import('./vanilla/nested-layout.ts'),
  'type-conversions': () => import('./vanilla/type-conversions.ts'),
  'preview-nodes':    () => import('./vanilla/preview-nodes.ts'),
  'edge-paths':         () => import('./vanilla/edge-paths.ts'),
  'properties-sidebar': () => import('./vanilla/properties-sidebar.ts'),
  'breadcrumb-dive':    () => import('./vanilla/breadcrumb-dive.ts'),
  'conditional-widgets': () => import('./vanilla/conditional-widgets.ts'),
}

export function hasVanilla(id: string): boolean { return id in MAP }

export async function mountVanillaExample(id: string, target: HTMLElement): Promise<() => void> {
  const loader = MAP[id]
  if (!loader) {
    target.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;color:#9a9a9a;font:13px Inter;">No vanilla implementation yet for this example.</div>'
    return () => {}
  }
  const mod = await loader()
  return mod.mount(target)
}
