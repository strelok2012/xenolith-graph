/** A custom pin data-type the host declares: its colour, optional shape, and extra compatibility.
 *  Consumed by both connection validation (`canConnect`) and the renderer (pin fill/stroke). */
export interface TypeDescriptor {
  id: string
  color: string
  shape?: 'circle' | 'diamond' | 'arrow'
  /** Types this one may also connect to, beyond an exact id match. Honoured symmetrically. */
  compatibleWith?: string[]
}

/** Registry of {@link TypeDescriptor}s. Pure, zero-dep — the editor owns one instance and hands it
 *  to `canConnect` and the renderer so custom typed pins get correct colours and connection rules. */
export class TypeRegistry {
  readonly #descriptors = new Map<string, TypeDescriptor>()

  get size(): number { return this.#descriptors.size }

  register(desc: TypeDescriptor): void { this.#descriptors.set(desc.id, desc) }
  unregister(id: string): boolean { return this.#descriptors.delete(id) }
  clear(): void { this.#descriptors.clear() }
  has(id: string): boolean { return this.#descriptors.has(id) }
  get(id: string): TypeDescriptor | undefined { return this.#descriptors.get(id) }
  all(): TypeDescriptor[] { return [...this.#descriptors.values()] }

  /** Are two pin types connectable by type? True on exact match, or if either descriptor lists the
   *  other in `compatibleWith` (symmetric). Does not handle `any`/exec — that stays in `canConnect`. */
  compatible(a: string, b: string): boolean {
    if (a === b) return true
    return (this.#descriptors.get(a)?.compatibleWith?.includes(b) ?? false) ||
           (this.#descriptors.get(b)?.compatibleWith?.includes(a) ?? false)
  }
}
