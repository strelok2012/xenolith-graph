import { describe, it, expect, vi } from 'vitest'
import { CommandRegistry, Commands, parseHotkey, matchHotkey } from './commands-registry.js'

describe('CommandRegistry — registration', () => {
  it('register + execute calls the command function', () => {
    const reg = new CommandRegistry()
    const fn = vi.fn()
    reg.register({ id: 'foo', label: 'Foo', execute: fn })
    expect(reg.execute('foo')).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('execute returns false for an unknown command (no throw)', () => {
    const reg = new CommandRegistry()
    expect(reg.execute('missing')).toBe(false)
  })

  it('register overwrites an existing command of the same id (with cleanup of the old hotkey)', () => {
    const reg = new CommandRegistry()
    reg.register({ id: 'x', label: 'X', execute: () => 1, hotkey: 'Cmd+K' })
    reg.register({ id: 'x', label: 'Y', execute: () => 2, hotkey: 'Cmd+L' })
    expect(reg.list().map((c) => c.label)).toEqual(['Y'])
    expect(reg.lookupByHotkey({ key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })?.id).toBeUndefined()
    expect(reg.lookupByHotkey({ key: 'l', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })?.id).toBe('x')
  })

  it('unregister removes the command (and frees the hotkey)', () => {
    const reg = new CommandRegistry()
    reg.register({ id: 'foo', label: 'Foo', execute: () => {}, hotkey: 'Cmd+K' })
    expect(reg.unregister('foo')).toBe(true)
    expect(reg.unregister('foo')).toBe(false)
    expect(reg.list()).toHaveLength(0)
    expect(reg.lookupByHotkey({ key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBeUndefined()
  })

  it('canExecute() respects the per-command predicate (default true)', () => {
    const reg = new CommandRegistry()
    reg.register({ id: 'a', label: 'A', execute: () => {} })                            // no predicate → always true
    reg.register({ id: 'b', label: 'B', execute: () => {}, canExecute: () => false })   // always blocked
    expect(reg.canExecute('a')).toBe(true)
    expect(reg.canExecute('b')).toBe(false)
    expect(reg.canExecute('missing')).toBe(false)                                        // unknown → false
  })

  it('execute returns false (and DOES NOT call execute) when canExecute is false', () => {
    const reg = new CommandRegistry()
    const fn = vi.fn()
    reg.register({ id: 'x', label: 'X', execute: fn, canExecute: () => false })
    expect(reg.execute('x')).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('list() returns commands in registration order with their hotkey strings', () => {
    const reg = new CommandRegistry()
    reg.register({ id: 'c', label: 'C', execute: () => {} })
    reg.register({ id: 'a', label: 'A', execute: () => {}, hotkey: 'Cmd+A' })
    reg.register({ id: 'b', label: 'B', execute: () => {} })
    expect(reg.list().map((c) => `${c.id}:${c.hotkey ?? '-'}`)).toEqual(['c:-', 'a:Cmd+A', 'b:-'])
  })
})

describe('parseHotkey', () => {
  it('parses key + modifiers from "Cmd+Shift+K"', () => {
    expect(parseHotkey('Cmd+Shift+K')).toEqual({ key: 'k', meta: true, ctrl: false, shift: true, alt: false })
  })

  it('Mod expands to meta on macOS, ctrl elsewhere — keep as `mod` flag for cross-platform match', () => {
    expect(parseHotkey('Mod+L')).toEqual({ key: 'l', meta: false, ctrl: false, shift: false, alt: false, mod: true })
  })

  it('accepts Ctrl, Alt, Option, Shift, Meta, Cmd, Command synonyms', () => {
    expect(parseHotkey('Ctrl+Alt+J').ctrl).toBe(true)
    expect(parseHotkey('Ctrl+Alt+J').alt).toBe(true)
    expect(parseHotkey('Option+P').alt).toBe(true)
    expect(parseHotkey('Command+S').meta).toBe(true)
    expect(parseHotkey('Meta+S').meta).toBe(true)
  })

  it('key is lowercased', () => {
    expect(parseHotkey('Shift+A').key).toBe('a')
  })

  it('throws on an empty / malformed string (fail fast — silent no-bind is worse)', () => {
    expect(() => parseHotkey('')).toThrow()
    expect(() => parseHotkey('Cmd+')).toThrow()
    expect(() => parseHotkey('+A')).toThrow()
  })
})

describe('matchHotkey', () => {
  const isMac = true

  it('matches modifiers + key exactly', () => {
    const spec = parseHotkey('Cmd+Shift+K')
    expect(matchHotkey(spec, { key: 'k', metaKey: true,  ctrlKey: false, shiftKey: true,  altKey: false }, isMac)).toBe(true)
    expect(matchHotkey(spec, { key: 'k', metaKey: false, ctrlKey: false, shiftKey: true,  altKey: false }, isMac)).toBe(false)
    expect(matchHotkey(spec, { key: 'k', metaKey: true,  ctrlKey: false, shiftKey: false, altKey: false }, isMac)).toBe(false)
    expect(matchHotkey(spec, { key: 'j', metaKey: true,  ctrlKey: false, shiftKey: true,  altKey: false }, isMac)).toBe(false)
  })

  it('Mod requires Cmd on macOS, Ctrl on others', () => {
    const spec = parseHotkey('Mod+K')
    expect(matchHotkey(spec, { key: 'k', metaKey: true,  ctrlKey: false, shiftKey: false, altKey: false }, true)).toBe(true)
    expect(matchHotkey(spec, { key: 'k', metaKey: false, ctrlKey: true,  shiftKey: false, altKey: false }, false)).toBe(true)
    expect(matchHotkey(spec, { key: 'k', metaKey: false, ctrlKey: true,  shiftKey: false, altKey: false }, true)).toBe(false)  // ctrl on mac ≠ mod
    expect(matchHotkey(spec, { key: 'k', metaKey: true,  ctrlKey: false, shiftKey: false, altKey: false }, false)).toBe(false) // cmd on non-mac ≠ mod
  })

  it('compares key case-insensitively (browser KeyboardEvent.key is sometimes upper-case for shifted)', () => {
    const spec = parseHotkey('Shift+A')
    expect(matchHotkey(spec, { key: 'A', metaKey: false, ctrlKey: false, shiftKey: true, altKey: false }, isMac)).toBe(true)
  })
})

describe('Commands namespace (O1 — typed constants)', () => {
  it('exposes stable string ids for stock actions', () => {
    // Stable contract — these IDs MUST NOT change once published; hosts/plugins compare against them.
    expect(Commands.Undo).toBe('editor.undo')
    expect(Commands.Redo).toBe('editor.redo')
    expect(Commands.SelectAll).toBe('editor.selection.selectAll')
    expect(Commands.DeleteSelected).toBe('editor.selection.delete')
    expect(Commands.Copy).toBe('editor.clipboard.copy')
    expect(Commands.Paste).toBe('editor.clipboard.paste')
    expect(Commands.FitView).toBe('editor.viewport.fit')
    expect(Commands.OpenPalette).toBe('editor.palette.open')
    expect(Commands.DiveIn).toBe('editor.dive.in')
    expect(Commands.GroupSelection).toBe('editor.group.create')
  })

  it('every constant value is unique (no accidental collision)', () => {
    const values = Object.values(Commands)
    expect(new Set(values).size).toBe(values.length)
  })

  it('a registered command keyed by Commands.X is found by the same constant', () => {
    const reg = new CommandRegistry()
    const fn = vi.fn()
    reg.register({ id: Commands.Undo, label: 'Undo', execute: fn })
    expect(reg.has(Commands.Undo)).toBe(true)
    expect(reg.execute(Commands.Undo)).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('arbitrary plugin-specific ids still register (Commands is conventional, not exclusive)', () => {
    const reg = new CommandRegistry()
    reg.register({ id: 'my-plugin.do-thing', label: 'X', execute: () => {} })
    expect(reg.has('my-plugin.do-thing')).toBe(true)
  })
})
