// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SidebarManager } from './sidebar.js'
import type { Node, WidgetSpec } from '@xenolith/core'

const mkNode = (id: string, title: string, widgets: WidgetSpec[], state: Record<string, unknown> = {}): Node => ({
  id: id as never, type: 'X', position: { x: 0, y: 0 },
  state, pins: [],
  widgets,
  render: { title } as never,
} as Node)

const slider = (id: string, key: string, sidebar = true): WidgetSpec =>
  ({ id, type: 'slider', key, label: key, min: 0, max: 1, step: 0.01, showInSidebar: sidebar })
const toggleW = (id: string, key: string, sidebar = true): WidgetSpec =>
  ({ id, type: 'toggle', key, label: key, showInSidebar: sidebar })

function harness() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const setValueCalls: Array<{ nodeId: string; widgetId: string; value: unknown }> = []
  const events: string[] = []
  const sb = new SidebarManager({
    overlayRoot: root,
    getNode: (id) => (currentNode?.id === id ? currentNode : undefined),
    setWidgetValue: (nodeId, widgetId, value) => setValueCalls.push({ nodeId: String(nodeId), widgetId, value }),
    onOpen: (nodeId) => events.push(`open:${nodeId}`),
    onClose: () => events.push('close'),
  })
  let currentNode: Node | null = null
  return {
    root, sb, setValueCalls, events,
    setNode: (n: Node) => { currentNode = n },
  }
}

describe('SidebarManager (G4 — Baklava sidebar parity)', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('isOpen reports false before open and after close', () => {
    const h = harness()
    expect(h.sb.isOpen()).toBe(false)
    h.setNode(mkNode('n', 'N', [slider('w', 'amount')]))
    h.sb.open('n' as never)
    expect(h.sb.isOpen()).toBe(true)
    h.sb.close()
    expect(h.sb.isOpen()).toBe(false)
  })

  it('open() mounts a panel into the overlay root with the node title in the header', () => {
    const h = harness()
    h.setNode(mkNode('n', 'My Node', [slider('w', 'amount')]))
    h.sb.open('n' as never)
    const panel = h.root.querySelector('[data-xeno-sidebar]')
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('My Node')
  })

  it('renders ONE control row per widget flagged showInSidebar (others skipped)', () => {
    const h = harness()
    h.setNode(mkNode('n', 'N', [
      slider('a', 'amount', true),                 // ✓ in sidebar
      slider('b', 'count',  false),                // ✗ not flagged
      toggleW('c', 'on',    true),                 // ✓ in sidebar
    ]))
    h.sb.open('n' as never)
    expect(h.root.querySelectorAll('[data-xeno-sidebar-widget]').length).toBe(2)
  })

  it('the close button hides the panel AND fires onClose', () => {
    const h = harness()
    h.setNode(mkNode('n', 'N', [slider('w', 'amount')]))
    h.sb.open('n' as never)
    const closeBtn = h.root.querySelector<HTMLButtonElement>('[data-xeno-sidebar-close]')
    closeBtn!.click()
    expect(h.sb.isOpen()).toBe(false)
    expect(h.events).toEqual(['open:n', 'close'])
  })

  it('opening a DIFFERENT node while one is already open swaps content (no leak)', () => {
    const h = harness()
    const a = mkNode('a', 'Alpha', [slider('w', 'amount')])
    const b = mkNode('b', 'Beta',  [slider('w', 'amount')])
    h.setNode(a); h.sb.open('a' as never)
    h.setNode(b); h.sb.open('b' as never)
    const panel = h.root.querySelector('[data-xeno-sidebar]')
    expect(panel!.textContent).toContain('Beta')
    expect(panel!.textContent).not.toContain('Alpha')
    expect(h.events).toEqual(['open:a', 'open:b'])
  })

  it('changing a slider commits via setWidgetValue with the parsed value', () => {
    const h = harness()
    h.setNode(mkNode('n', 'N', [slider('amount', 'amount')], { amount: 0.2 }))
    h.sb.open('n' as never)
    const input = h.root.querySelector<HTMLInputElement>('[data-xeno-sidebar-widget="amount"] input[type="range"]')
    expect(input).not.toBeNull()
    input!.value = '0.75'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    expect(h.setValueCalls.pop()).toEqual({ nodeId: 'n', widgetId: 'amount', value: 0.75 })
  })

  it('changing a toggle commits via setWidgetValue with a boolean', () => {
    const h = harness()
    h.setNode(mkNode('n', 'N', [toggleW('on', 'on')], { on: false }))
    h.sb.open('n' as never)
    const input = h.root.querySelector<HTMLInputElement>('[data-xeno-sidebar-widget="on"] input[type="checkbox"]')
    input!.checked = true
    input!.dispatchEvent(new Event('change', { bubbles: true }))
    expect(h.setValueCalls.pop()).toEqual({ nodeId: 'n', widgetId: 'on', value: true })
  })

  it('refresh() re-renders the panel with the current node state (live update from outside)', () => {
    const h = harness()
    const n = mkNode('n', 'N', [slider('amount', 'amount')], { amount: 0.2 })
    h.setNode(n); h.sb.open('n' as never)
    let input = h.root.querySelector<HTMLInputElement>('[data-xeno-sidebar-widget="amount"] input[type="range"]')!
    expect(input.value).toBe('0.2')
    n.state['amount'] = 0.9
    h.sb.refresh()
    input = h.root.querySelector<HTMLInputElement>('[data-xeno-sidebar-widget="amount"] input[type="range"]')!
    expect(input.value).toBe('0.9')
  })

  it('open() on an unknown node is a no-op (no panel, no events)', () => {
    const h = harness()
    h.sb.open('ghost' as never)
    expect(h.sb.isOpen()).toBe(false)
    expect(h.root.querySelector('[data-xeno-sidebar]')).toBeNull()
    expect(h.events).toEqual([])
  })

  it('dispose() removes the panel from the DOM', () => {
    const h = harness()
    h.setNode(mkNode('n', 'N', [slider('w', 'amount')]))
    h.sb.open('n' as never)
    h.sb.dispose()
    expect(h.root.querySelector('[data-xeno-sidebar]')).toBeNull()
  })
})
