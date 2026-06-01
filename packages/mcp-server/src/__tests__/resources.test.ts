import { describe, it, expect } from 'vitest'
import { RESOURCES } from '../resources.js'
import { TOOLS } from '../tools.js'

describe('MCP resources', () => {
  it('exposes graph://current and schema://types in the minimum set', () => {
    const uris = RESOURCES.map((r) => r.uri).sort()
    expect(uris).toEqual(['graph://current', 'schema://types'])
  })

  it('every resource forwards to a remote tool that actually exists', () => {
    // Set<string> (not Set<literal-union>) so `.has(r.remoteTool: string)` typechecks under strict.
    const toolNames = new Set<string>(Object.values(TOOLS).map((t) => t.name))
    for (const r of RESOURCES) {
      expect(toolNames.has(r.remoteTool)).toBe(true)
    }
  })

  it('resources declare JSON mime type (clients render them as code)', () => {
    for (const r of RESOURCES) expect(r.mimeType).toBe('application/json')
  })
})
