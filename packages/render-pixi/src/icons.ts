// Built-in header glyph icons (Feather, MIT). Each value is the INNER markup of a 24×24 viewBox svg
// (the editor/renderer wraps it with stroke styling). IMPORTANT: PIXI's SVG parser splits
// polyline/polygon points on integer boundaries (it drops decimals), so every shape here is a
// <path>/<circle>/<rect>/<ellipse> — never <polyline>/<polygon>. Lines are written as paths too.
export const BUILTIN_ICONS: Record<string, string> = {
  layers:
    '<path d="M12 2 2 7 12 12 22 7 12 2Z"/><path d="M2 17 12 22 22 17"/><path d="M2 12 12 17 22 12"/>',
  box:
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.27 6.96 12 12.01 20.73 6.96"/><path d="M12 22.08V12"/>',
  cpu:
    '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>',
  branch:
    '<path d="M6 3V15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  code:
    '<path d="M16 18 22 12 16 6"/><path d="M8 6 2 12 8 18"/>',
  play:
    '<path d="M5 3 19 12 5 21Z"/>',
  zap:
    '<path d="M13 2 3 14 12 14 11 22 21 10 12 10 13 2Z"/>',
  clock:
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag:
    '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  circle:
    '<circle cx="12" cy="12" r="9"/>',
  square:
    '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  diamond:
    '<path d="M12 3 21 12 12 21 3 12Z"/>',
}

/** Registry of header glyph icons by name. Seeded with the built-in Feather set; hosts/plugins add
 *  their own via `register(name, svgInner)`. The renderer resolves a node's glyph name to its svg. */
export class IconRegistry {
  readonly #icons = new Map<string, string>(Object.entries(BUILTIN_ICONS))

  /** Register (or override) a named icon. `svgInner` is the inner markup of a 24×24 svg — use
   *  `<path>`/`<circle>`/`<rect>`/`<ellipse>` (avoid `<polyline>`/`<polygon>` with decimal coords). */
  register(name: string, svgInner: string): void { this.#icons.set(name, svgInner) }
  unregister(name: string): boolean { return this.#icons.delete(name) }
  has(name: string): boolean { return this.#icons.has(name) }
  get(name: string): string | undefined { return this.#icons.get(name) }
  names(): string[] { return [...this.#icons.keys()] }
}
