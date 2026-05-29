// Pure summary stats for the live metrics panel.

/** Gini coefficient (0 = perfectly equal, →1 = maximally unequal) of a non-negative distribution,
 *  e.g. cumulative goodies received per agent. Returns 0 for an all-zero or single-element input. */
export function gini(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const sum = values.reduce((s, v) => s + Math.max(0, v), 0)
  if (sum === 0) return 0
  let absDiffs = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) absDiffs += Math.abs(values[i]! - values[j]!)
  }
  return absDiffs / (2 * n * sum)
}
