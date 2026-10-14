import type { Key } from 'ink'
import { describe, expect, it } from 'vitest'
import { workspaceInput, mouseReport } from './input.js'
import { workspaceFrame } from './frame.js'
import { createWorkspace } from './state.js'
import { newSetup } from '../../terminal-setup/index.js'
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
    expect(workspaceInput('', key({ return: true, shift: true }), s, f).patch?.draft).toBe('a👁\nb')
    expect(workspaceInput('[27;2;13~', key(), s, f).patch?.draft).toBe('a👁\nb')
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
  it('scrolls all installation jobs in a compact terminal without relying on the file browser', () => {
    const s = createWorkspace('setup')
    s.setup = {
      ...newSetup('server'),
      stage: 'download',
      selections: Array.from({ length: 4 }, (_, i) => ({
        requestId: `job-${i}`,
        request: { repo: 'owner/repo', file: `${i}.gguf` },
        plan: { model_id: `model-${i}`, model: { size: 1000 }, total_download_bytes: 1000 } as never,
      })),
    }
    s.focus = 'setup-job:0'
    for (let i = 0; i < 3; i++)
      Object.assign(s, workspaceInput('', key({ downArrow: true }), s, workspaceFrame(s, 54, 24, 0)).patch)
    expect(s.focus).toBe('setup-job:3')
    const f = workspaceFrame(s, 54, 24, 0)
    expect(f.targets.some((t) => t.id === s.focus)).toBe(true)
    for (const t of f.targets) {
      expect(t.y + t.height).toBeLessThanOrEqual(t.y === 23 ? 24 : 21)
      expect(t.x + t.width).toBeLessThanOrEqual(54)
    }
  })
})

it.each([
  ['1', 'hosting'],
  ['2', 'setup-manual'],
  ['3', 'agent-setup'],
])('opens the intro choice with %s, regardless of focus', (input, action) => {
  const s = createWorkspace('welcome')
  for (const focus of ['personal', 'hosting', 'composer', '']) {
    s.focus = focus
    expect(workspaceInput(input!, key(), s, workspaceFrame(s, 80, 24, 0)).action).toBe(action)
  }
  s.overlay = 'endpoint'
  expect(workspaceInput(input!, key(), s, workspaceFrame(s, 80, 24, 0)).patch?.editValue).toBe(input)
})

it('Enter activates the visibly highlighted control and confirms Cancel in an editor', () => {
  const s = createWorkspace('server')
  s.focus = 'api-toggle'
  s.hover = 'page:models'
  expect(workspaceInput('', key({ return: true }), s, workspaceFrame(s, 80, 24, 0)).action).toBe(
    'page:models'
  )
  s.overlay = 'menu'
  s.focus = 'page:chat'
  Object.assign(s, workspaceInput('', key({ downArrow: true }), s, workspaceFrame(s, 80, 24, 0)).patch)
  expect(s.hover).toBe('')
  expect(workspaceInput('', key({ return: true }), s, workspaceFrame(s, 80, 24, 0)).action).toBe(s.focus)
  s.overlay = 'endpoint'
  s.hover = ''
  s.focus = 'save-edit'
  Object.assign(s, workspaceInput('', key({ tab: true }), s, workspaceFrame(s, 80, 24, 0)).patch)
  expect(s.focus).toBe('close')
  expect(workspaceInput('', key({ return: true }), s, workspaceFrame(s, 80, 24, 0)).action).toBe('close')
  s.overlay = null
  s.page = 'chat'
  s.focus = 'composer'
  s.hover = 'page:models'
  expect(workspaceInput('', key({ return: true }), s, workspaceFrame(s, 80, 24, 0)).action).toBe('send')
})
