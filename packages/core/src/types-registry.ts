/** A custom pin data-type the host declares: its colour, optional shape, and extra compatibility.
 *  Consumed by both connection validation (`canConnect`) and the renderer (pin fill/stroke). */
export interface TypeDescriptor {
  id: string
  color: string
  shape?: 'circle' | 'diamond' | 'arrow'
  /** Types this one may also connect to, beyond an exact id match. Honoured symmetrically. */
  compatibleWith?: string[]
}

/** A directional conversion `from → to`. Applied to values flowing across an edge when the OUT
 *  pin's type differs from the IN pin's type. Pure — the same input should always yield the same
 *  output. Throwing is allowed (signals an invalid value at runtime) — the editor doesn't catch. */
export type ConversionFn = (value: unknown) => unknown

/** Registry of {@link TypeDescriptor}s. Pure, zero-dep — the editor owns one instance and hands it
 *  to `canConnect` and the renderer so custom typed pins get correct colours and connection rules. */
export class TypeRegistry {
  readonly #descriptors = new Map<string, TypeDescriptor>()
  // Conversions are keyed `${from}→${to}` to make lookup O(1) and direction explicit. Symmetry
  // (`from→to` does NOT imply `to→from`) matters: a `number→text` cast is well-defined; the
  // reverse needs its own parse with its own failure mode.
  readonly #conversions = new Map<string, ConversionFn>()

  get size(): number { return this.#descriptors.size }

  register(desc: TypeDescriptor): void { this.#descriptors.set(desc.id, desc) }
  unregister(id: string): boolean { return this.#descriptors.delete(id) }
  clear(): void {
    this.#descriptors.clear()
    // Conversions are tied to the type pairs they bridge — clearing types clears conversions too,
    // otherwise stale entries would silently lift `compatible()` for types that no longer exist.
    this.#conversions.clear()
  }
  has(id: string): boolean { return this.#descriptors.has(id) }
  get(id: string): TypeDescriptor | undefined { return this.#descriptors.get(id) }
  all(): TypeDescriptor[] { return [...this.#descriptors.values()] }

  // ---- conversions (G2 — type-driven value coercion across an edge) ----------------------------

  /** Register a value-coercion function applied when an OUT pin of type `from` connects to an IN
   *  pin of type `to`. Directional — call again with swapped args for the reverse direction.
   *  Replaces any prior fn for the same pair. */
  registerConversion(from: string, to: string, fn: ConversionFn): void {
    this.#conversions.set(`${from}${to}`, fn)
  }
  unregisterConversion(from: string, to: string): boolean {
    return this.#conversions.delete(`${from}${to}`)
  }
  hasConversion(from: string, to: string): boolean {
    return this.#conversions.has(`${from}${to}`)
  }
  getConversion(from: string, to: string): ConversionFn | undefined {
    return this.#conversions.get(`${from}${to}`)
  }
  /** Apply the conversion `from → to` to `value`. Identity when `from === to`. Throws when no
   *  conversion is registered (use `hasConversion` first if you need to choose at runtime). */
  convert(value: unknown, from: string, to: string): unknown {
    if (from === to) return value
    const fn = this.#conversions.get(`${from}${to}`)
    if (!fn) throw new Error(`TypeRegistry: no conversion registered for ${from} → ${to}`)
    return fn(value)
  }

  /** Are two pin types connectable by type? True on exact match, or if either descriptor lists the
   *  other in `compatibleWith` (symmetric), or if EITHER direction has a registered conversion.
   *  Returning true for either-direction conversion keeps `canConnect` orientation-agnostic — the
   *  actual cast is applied per-direction at value-flow time using `convert(from, to)`. */
  compatible(a: string, b: string): boolean {
    if (a === b) return true
    if ((this.#descriptors.get(a)?.compatibleWith?.includes(b) ?? false) ||
        (this.#descriptors.get(b)?.compatibleWith?.includes(a) ?? false)) return true
    return this.hasConversion(a, b) || this.hasConversion(b, a)
  }
}
