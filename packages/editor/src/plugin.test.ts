import { describe, it, expect, vi } from 'vitest'
import { PluginHost, type PluginContext } from './plugin.js'

const stubContext = (): PluginContext => ({}) as unknown as PluginContext

describe('PluginHost', () => {
  it('calls install once with the context on use()', () => {
    const ctx = stubContext()
    const host = new PluginHost(() => ctx)
    const install = vi.fn()
    host.use({ name: 'p', install })
    expect(install).toHaveBeenCalledTimes(1)
    expect(install).toHaveBeenCalledWith(ctx)
    expect(host.has('p')).toBe(true)
  })

  it('runs the returned disposer on dispose() and forgets the plugin', () => {
    const disposer = vi.fn()
    const host = new PluginHost(stubContext)
    host.use({ name: 'p', install: () => disposer })
    expect(disposer).not.toHaveBeenCalled()
    host.dispose()
    expect(disposer).toHaveBeenCalledTimes(1)
    expect(host.has('p')).toBe(false)
  })

  it('a plugin returning void installs cleanly and dispose is a no-op for it', () => {
    const host = new PluginHost(stubContext)
    host.use({ name: 'p', install: () => {} })
    expect(() => host.dispose()).not.toThrow()
  })

  it('installing two plugins with the same name throws', () => {
    const host = new PluginHost(stubContext)
    host.use({ name: 'dup', install: () => {} })
    expect(() => host.use({ name: 'dup', install: () => {} })).toThrow(/already installed/)
  })

  it('disposes every installed plugin', () => {
    const a = vi.fn()
    const b = vi.fn()
    const host = new PluginHost(stubContext)
    host.use({ name: 'a', install: () => a })
    host.use({ name: 'b', install: () => b })
    host.dispose()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
