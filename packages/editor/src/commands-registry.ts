// G1 — Named Commands API + hotkey binding. Baklava parity (`commandHandler.registerCommand` +
// `registerHotkey`) plus a more compact API: pass the hotkey string in the command spec, the
// registry handles dispatch. The host attaches a keydown listener that calls `lookupByHotkey`
// against the current event and `execute()`s the match if `canExecute()` is true.
//
// This module is PURE — no DOM, no editor — so it tests headlessly. The editor wires up the
// global keydown listener and exposes the registry via `editor.commands`.

/** Well-known command ids hosts and plugins can target. Use these instead of bare strings — autocomplete,
 *  typo protection, and a stable contract for which actions hosts can override. Bare strings still
 *  work (`CommandSpec.id` is `CommandId | string`) — these constants are the conventional names. */
export const Commands = {
  // History
  Undo:            'editor.undo',
  Redo:            'editor.redo',
  // Selection
  SelectAll:       'editor.selection.selectAll',
  DeselectAll:     'editor.selection.clear',
  DeleteSelected:  'editor.selection.delete',
  DuplicateSelected: 'editor.selection.duplicate',
  // Clipboard
  Copy:            'editor.clipboard.copy',
  Paste:           'editor.clipboard.paste',
  Cut:             'editor.clipboard.cut',
  // Viewport
  FitView:         'editor.viewport.fit',
  ResetView:       'editor.viewport.reset',
  ZoomIn:          'editor.viewport.zoomIn',
  ZoomOut:         'editor.viewport.zoomOut',
  // Palette / search
  OpenPalette:     'editor.palette.open',
  ClosePalette:    'editor.palette.close',
  // Sidebar
  OpenSidebar:     'editor.sidebar.open',
  CloseSidebar:    'editor.sidebar.close',
  // Subgraph
  DiveIn:          'editor.dive.in',
  DiveOut:         'editor.dive.out',
  // Grouping
  GroupSelection:  'editor.group.create',
  Ungroup:         'editor.group.ungroup',
} as const

export type CommandId = (typeof Commands)[keyof typeof Commands]

export interface CommandSpec {
  /** Unique id used by `execute(id)`. Re-registering the same id REPLACES the prior command.
   *  Prefer the `Commands` namespace constants (`Commands.Undo`, …) for stock actions; arbitrary
   *  strings are accepted for plugin-specific commands. */
  id: CommandId | (string & {})
  /** Human label for menus / palette listings. */
  label: string
  /** Run the command. Return value is ignored. */
  execute: () => void
  /** Gate the command. Returning false leaves `execute` un-called AND keeps the hotkey from
   *  firing — useful for things like "Undo" when the history is empty. Default: always true. */
  canExecute?: () => boolean
  /** Optional hotkey string — `"Cmd+Shift+K"`, `"Mod+L"` (`Mod` = Cmd on macOS, Ctrl elsewhere),
   *  `"Ctrl+Alt+J"`, `"Option+P"`, etc. Throws on registration if malformed. */
  hotkey?: string
}

interface RegisteredCommand extends CommandSpec {
  hotkeySpec?: HotkeySpec
}

export interface HotkeySpec {
  key: string                              // lower-case letter / digit / Escape / etc.
  meta: boolean                            // explicit Cmd/Meta (NOT via Mod)
  ctrl: boolean                            // explicit Ctrl  (NOT via Mod)
  shift: boolean
  alt: boolean
  mod?: boolean                            // cross-platform — Cmd on macOS, Ctrl elsewhere
}

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

const SYNONYM: Record<string, keyof HotkeySpec | 'mod'> = {
  cmd: 'meta', command: 'meta', meta: 'meta', '⌘': 'meta',
  ctrl: 'ctrl', control: 'ctrl',
  shift: 'shift', '⇧': 'shift',
  alt: 'alt', option: 'alt', '⌥': 'alt',
  mod: 'mod',
}

/** Parse `"Cmd+Shift+K"`-style strings into a normalised `HotkeySpec`. Order-insensitive; key
 *  must be the LAST segment (case-insensitive). Throws on empty / no-key strings — silent failure
 *  was rejected because a hotkey that "registers fine but never fires" is the worst kind of bug. */
export function parseHotkey(s: string): HotkeySpec {
  if (!s) throw new Error('parseHotkey: empty string')
  const parts = s.split('+').map((p) => p.trim()).filter((p) => p.length > 0)
  if (parts.length === 0 || parts.length !== s.split('+').length) {
    throw new Error(`parseHotkey: malformed hotkey "${s}"`)
  }
  const spec: HotkeySpec = { key: '', meta: false, ctrl: false, shift: false, alt: false }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!
    const isLast = i === parts.length - 1
    const synonym = SYNONYM[p.toLowerCase()]
    if (synonym) {
      if (synonym === 'mod') spec.mod = true
      else if (synonym === 'meta') spec.meta = true
      else if (synonym === 'ctrl') spec.ctrl = true
      else if (synonym === 'shift') spec.shift = true
      else if (synonym === 'alt') spec.alt = true
      continue
    }
    if (!isLast) throw new Error(`parseHotkey: unknown modifier "${p}" in "${s}"`)
    spec.key = p.toLowerCase()
  }
  if (spec.key === '') throw new Error(`parseHotkey: missing key in "${s}"`)
  return spec
}

/** Does `spec` describe the modifier+key state of `e`? `isMac` controls Mod resolution
 *  (Cmd on macOS, Ctrl elsewhere). Key comparison is case-insensitive. */
export function matchHotkey(spec: HotkeySpec, e: KeyEventLike, isMac: boolean): boolean {
  if (spec.key !== e.key.toLowerCase()) return false
  // Resolve required modifiers. Mod folds into platform-specific meta/ctrl; explicit meta/ctrl
  // stack on top (so `Cmd+Ctrl+K` is still expressible if anyone needs it).
  const needMeta  = spec.meta  || (spec.mod === true && isMac)
  const needCtrl  = spec.ctrl  || (spec.mod === true && !isMac)
  if (e.metaKey  !== needMeta)  return false
  if (e.ctrlKey  !== needCtrl)  return false
  if (e.shiftKey !== spec.shift) return false
  if (e.altKey   !== spec.alt)   return false
  return true
}

export class CommandRegistry {
  readonly #byId = new Map<string, RegisteredCommand>()

  register(spec: CommandSpec): void {
    const hotkeySpec = spec.hotkey ? parseHotkey(spec.hotkey) : undefined
    const reg: RegisteredCommand = {
      ...spec,
      ...(hotkeySpec ? { hotkeySpec } : {}),
    }
    this.#byId.set(spec.id, reg)
  }

  unregister(id: string): boolean { return this.#byId.delete(id) }

  has(id: string): boolean { return this.#byId.has(id) }

  list(): ReadonlyArray<{ id: string; label: string; hotkey?: string }> {
    return [...this.#byId.values()].map((c) => ({
      id: c.id, label: c.label,
      ...(c.hotkey !== undefined ? { hotkey: c.hotkey } : {}),
    }))
  }

  canExecute(id: string): boolean {
    const cmd = this.#byId.get(id)
    if (!cmd) return false
    return cmd.canExecute ? !!cmd.canExecute() : true
  }

  execute(id: string): boolean {
    const cmd = this.#byId.get(id)
    if (!cmd) return false
    if (cmd.canExecute && !cmd.canExecute()) return false
    cmd.execute()
    return true
  }

  /** First command whose hotkey matches `e`. Returns undefined if no command's hotkey matches
   *  OR if the matched command's `canExecute()` is false. */
  lookupByHotkey(e: KeyEventLike, isMac = isMacPlatform()): RegisteredCommand | undefined {
    for (const cmd of this.#byId.values()) {
      if (cmd.hotkeySpec && matchHotkey(cmd.hotkeySpec, e, isMac)) {
        if (cmd.canExecute && !cmd.canExecute()) continue
        return cmd
      }
    }
    return undefined
  }
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent ?? '')
}
