import type { Key } from 'ink'
import { describe, expect, it } from 'vitest'
import { workspaceInput, mouseReport } from './input.js'
import { workspaceFrame } from './frame.js'
import { createWorkspace } from './state.js'
const key = (value: Partial<Key> = {}) => value as Key
describe('keyboard and mouse controls', () => {
  it('routes the same visible button from keyboard and mouse', () => {
    const s = createWorkspace('server'),
      f = workspaceFrame(s, 100, 30, 0),
      t = f.targets.find((t) => t.id === 'api-toggle')!
    expect(workspaceInput(`[<0;${t.x + 1};${t.y + 1}M`, key(), s, f).action).toBe('api-toggle')
    s.focus = 'api-toggle'
    expect(workspaceInput('', key({ return: true }), s, f).action).toBe('api-toggle')
    expect(workspaceInput(`[<32;${t.x + 1};${t.y + 1}M`, key(), s, f).patch?.hover).toBe('api-toggle')
    expect(mouseReport('[<0;3;4m')).toEqual({ code: 0, x: 2, y: 3, released: true })
  })
  it('protects the composer from mouse reports and preserves printable shortcut letters', () => {
    const s = createWorkspace('chat'),
      f = workspaceFrame(s, 80, 24, 0)
    expect(workspaceInput('[<0;1;1M', key(), s, f).patch?.draft).toBeUndefined()
    expect(workspaceInput('[<0;1;', key(), s, f)).toEqual({})
    expect(workspaceInput('q?cm', key(), s, f).patch?.draft).toBe('q?cm')
    s.draft = 'a👁b'
    s.cursor = 2
    expect(workspaceInput('', key({ backspace: true }), s, f).patch).toEqual({ draft: 'ab', cursor: 1 })
    expect(workspaceInput('', key({ return: true, meta: true }), s, f).patch?.draft).toBe('a👁\nb')
  })
  it('scrolls model focus past a screenful and exposes the new mouse target', () => {
    const s = createWorkspace('models')
    s.models = Array.from({ length: 100 }, (_, i) => `Model ${i}`)
    s.focus = 'model:0'
    for (let i = 0; i < 75; i++)
      Object.assign(s, workspaceInput('', key({ downArrow: true }), s, workspaceFrame(s, 80, 24, 0)).patch)
    expect(s.focus).toBe('model:75')
    expect(workspaceFrame(s, 80, 24, 0).targets.some((t) => t.id === s.focus)).toBe(true)
  })
  it('uses a leader menu without stealing text; Escape dismisses the current layer', () => {
    const s = createWorkspace('chat'),
      f = workspaceFrame(s, 80, 24, 0)
    expect(workspaceInput('g', key({ ctrl: true }), s, f)).toMatchObject({
      leader: true,
      patch: { overlay: 'menu' },
    })
    expect(workspaceInput('s', key(), s, f, true).action).toBe('page:server')
    s.overlay = 'help'
    expect(workspaceInput('', key({ escape: true }), s, f).action).toBe('close')
    expect(workspaceInput('q', key({ ctrl: true }), s, f).quit).toBe(true)
  })
})
