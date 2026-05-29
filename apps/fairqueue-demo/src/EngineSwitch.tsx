// Top-of-panel pill switch between the three views: native JS step(), plugin VM, and the merged
// "agents are nodes" graph. Themed entirely from --xeno-* vars so it picks up Xen / Liquid Glass.

export type EngineId = 'js' | 'runtime' | 'merged'

const OPTS: ReadonlyArray<{ id: EngineId; label: string; hint: string }> = [
  { id: 'js', label: 'JS step()', hint: 'native reference' },
  { id: 'runtime', label: 'Runtime', hint: 'plugin VM' },
  { id: 'merged', label: 'Merged', hint: 'agents as nodes' },
]

export function EngineSwitch(props: { current: EngineId }) {
  const go = (id: EngineId): void => {
    if (id === props.current) return
    const u = new URL(globalThis.location.href)
    if (id === 'js') u.searchParams.delete('engine'); else u.searchParams.set('engine', id)
    globalThis.location.assign(u.toString())
  }
  return (
    <div style={{
      display: 'flex', gap: 4, padding: 3,
      background: 'var(--xeno-bg, rgba(0,0,0,0.3))',
      border: '1px solid var(--xeno-border, rgba(255,255,255,0.1))',
      borderRadius: 'var(--xeno-radius, 6px)',
    }}>
      {OPTS.map((o) => {
        const active = o.id === props.current
        return (
          <button
            key={o.id}
            onClick={() => go(o.id)}
            title={o.hint}
            style={{
              flex: 1, padding: '5px 8px', border: 'none', borderRadius: 4,
              cursor: active ? 'default' : 'pointer',
              background: active ? 'var(--xeno-accent, #d8a657)' : 'transparent',
              color: active ? 'var(--xeno-canvas, #000)' : 'var(--xeno-text, #fff)',
              font: 'inherit', fontSize: 11, fontWeight: active ? 700 : 500,
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}
