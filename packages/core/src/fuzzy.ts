/**
 * Tiny zero-dependency fuzzy matcher for the insert palette. Subsequence match with a score that
 * rewards contiguous runs, matches at word boundaries (camelCase / separators), and an early
 * first match. Returns the matched character indices so the UI can highlight them.
 *
 * Lives in `@xenolith/core` (zero-dep invariant) so the node registry's search stays headless —
 * hence hand-rolled rather than a package.
 */

export interface FuzzyMatch {
  matched: boolean
  /** Higher is better. 0 for an empty query or a non-match. */
  score: number
  /** Indices into `target` of the matched characters, in order. For highlighting. */
  indices: number[]
}

const SCORE_FIRST_CHAR   = 8   // bonus when the first query char lands at target[0]
const SCORE_CONSECUTIVE  = 6   // bonus per char that immediately follows the previous match
const SCORE_WORD_START   = 5   // bonus when a match lands at a word boundary
const SCORE_BASE         = 1   // every matched char scores at least this

function isWordStart(target: string, i: number): boolean {
  if (i === 0) return true
  const prev = target[i - 1]!
  const cur  = target[i]!
  if (prev === ' ' || prev === '_' || prev === '-' || prev === '/' || prev === '.') return true
  // camelCase boundary: lower→Upper
  if (prev >= 'a' && prev <= 'z' && cur >= 'A' && cur <= 'Z') return true
  return false
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch {
  if (query.length === 0) return { matched: true, score: 0, indices: [] }

  const q = query.toLowerCase()
  const t = target.toLowerCase()

  const indices: number[] = []
  let score = 0
  let qi = 0
  let prevMatch = -2 // so the first match is never "consecutive"

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue
    indices.push(ti)
    let charScore = SCORE_BASE
    if (ti === prevMatch + 1) charScore += SCORE_CONSECUTIVE
    if (isWordStart(target, ti)) charScore += SCORE_WORD_START
    if (qi === 0 && ti === 0) charScore += SCORE_FIRST_CHAR
    // Earlier matches are slightly better — small decay by position keeps prefix wins ahead.
    charScore += Math.max(0, 4 - ti * 0.1)
    score += charScore
    prevMatch = ti
    qi++
  }

  if (qi < q.length) return { matched: false, score: 0, indices: [] }
  return { matched: true, score, indices }
}
