// The runtime value model. `exec` is control flow, NOT a value — only data pins carry these.
// Collections (agents / units / events) are just typed arrays, so the Array primitives apply to all.

export type VmValue = number | boolean | string | VmValue[] | { [key: string]: VmValue }

export function asNumber(v: VmValue | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function asBool(v: VmValue | undefined): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.length > 0
  if (Array.isArray(v)) return v.length > 0
  return false
}

export function asArray(v: VmValue | undefined): VmValue[] {
  return Array.isArray(v) ? v : []
}
