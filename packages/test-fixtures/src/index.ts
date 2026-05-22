import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MANIFEST } from './manifest.js'
import type { FixtureFormat, FixtureRecord, FixtureSize } from './manifest.js'

export { MANIFEST }
export type { FixtureFormat, FixtureRecord, FixtureSize } from './manifest.js'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function listFixtures(filter?: {
  format?: FixtureFormat
  size?: FixtureSize
}): readonly FixtureRecord[] {
  if (!filter) return MANIFEST
  return MANIFEST.filter(
    (record) =>
      (filter.format === undefined || record.format === filter.format) &&
      (filter.size === undefined || record.size === filter.size),
  )
}

export function findFixture(id: string): FixtureRecord | undefined {
  return MANIFEST.find((record) => record.id === id)
}

export async function loadFixture(id: string): Promise<unknown> {
  const record = findFixture(id)
  if (!record) {
    throw new Error(`Unknown fixture: ${id}. See MANIFEST for the available ids.`)
  }
  const absolute = resolve(PACKAGE_ROOT, record.path)
  const raw = await readFile(absolute, 'utf8')
  return JSON.parse(raw) as unknown
}
