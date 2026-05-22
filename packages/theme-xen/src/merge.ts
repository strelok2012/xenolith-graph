import type { XenTokens } from './types.js'

/** Recursively-optional version of `XenTokens` for partial overrides. */
export type DeepPartial<T> = T extends ReadonlyArray<infer _>
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value.constructor === Object || value.constructor === undefined)
  )
}

function mergeDeep<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    const o = override[key]
    if (o === undefined) continue
    const b = base[key]
    if (isPlainObject(o) && isPlainObject(b)) {
      result[key] = mergeDeep(b, o)
    } else {
      result[key] = o
    }
  }
  return result as T
}

/**
 * Produce a new `XenTokens` with `override` deep-merged into `base`. Plain-object branches are
 * merged recursively; arrays, strings, and numbers in `override` replace whole values. Always
 * returns a new object — the base is never mutated.
 */
export function mergeTheme(base: XenTokens, override: DeepPartial<XenTokens>): XenTokens {
  return mergeDeep(
    base as unknown as Record<string, unknown>,
    override as unknown as Record<string, unknown>,
  ) as unknown as XenTokens
}
