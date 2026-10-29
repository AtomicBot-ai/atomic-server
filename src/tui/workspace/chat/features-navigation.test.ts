import { expect, it } from 'vitest'
import type { Key } from 'ink'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { featureData } from '../server/feature-model.js'
import { chatFeatureAction } from './features.js'
import type { ActionContext } from '../actions.js'

it.each([
  [54, 24],
  [120, 40],
])('reaches and toggles the hidden tail of Tools at %ix%i', async (width, height) => {
  const s = createWorkspace('chat'),
    data = featureData(s)
  data.skills = Array.from({ length: 20 }, (_, i) => ({
    name: `skill-${i}`,
    description: '',
    body: '',
    enabled: true,
    updated_at: 0,
  }))
  data.connectors = [
    {
      id: 'last',
      name: 'Last connector',
      enabled: true,
      type: 'http',
      url: 'http://localhost/mcp',
      command: '',
      args: [],
      env: {},
      headers: {},
      timeout: 30,
    },
  ]
  data.connector_status = { last: { state: 'connected', tools: [] } }
  s.workspace = { features: data } as typeof s.workspace
  s.overlay = 'chat-features'
  const first = `chat-assistant:${data.default_assistant}`
  for (const [input, key] of [
    ['', { tab: true }],
    ['', { downArrow: true }],
    ['[<65;20;12M', {}],
  ] as [string, Partial<Key>][]) {
    s.focus = first
    const seen = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const frame = workspaceFrame(s, width!, height!, 0)
      for (const t of frame.targets) seen.add(t.id)
      Object.assign(s, workspaceInput(input, key as Key, s, frame).patch)
    }
    for (let i = 0; i < 20; i++) expect(seen.has(`chat-skill:skill-${i}`)).toBe(true)
    expect(seen.has('chat-connector:last')).toBe(true)
  }
  s.focus = first
  for (let i = 0; i < 60 && s.focus !== 'chat-connector:last'; i++)
    Object.assign(
      s,
      workspaceInput('', { downArrow: true } as Key, s, workspaceFrame(s, width!, height!, 0)).patch
    )
  expect(s.focus).toBe('chat-connector:last')
  const action = workspaceInput('', { return: true } as Key, s, workspaceFrame(s, width!, height!, 0)).action
  const ctx = {
    get: () => s,
    update: (fn) => {
      Object.assign(s, fn(s))
    },
  } as ActionContext
  await chatFeatureAction(action!, ctx)
  expect(s.chatPreferences).toMatchObject({ atomic_connectors: ['last'] })
  expect(workspaceInput('q', { ctrl: true } as Key, s, workspaceFrame(s, width!, height!, 0)).quit).toBe(true)
  expect(workspaceInput('', { escape: true } as Key, s, workspaceFrame(s, width!, height!, 0)).action).toBe(
    'close'
  )
})

it('keeps headers out of navigation, preserves footer access and clamps page/wheel movement', () => {
  const s = {
    ...createWorkspace('chat'),
    overlay: 'chat-features' as const,
    focus: 'chat-assistant:atomic-chat',
  }
  const press = (input: string, key: Partial<Key> = {}) => {
    Object.assign(s, workspaceInput(input, key as Key, s, workspaceFrame(s, 120, 40, 0)).patch)
    expect(workspaceFrame(s, 120, 40, 0).targets.some((t) => t.id === s.focus)).toBe(true)
  }
  press('', { pageUp: true })
  expect(s.focus).toBe('chat-assistant:atomic-chat')
  press('', { tab: true, shift: true })
  expect(s.focus).toBe('quit')
  press('', { upArrow: true })
  expect(s.focus).toBe('help')
  press('', { pageDown: true })
  expect(s.focus).toBe('quit')
  press('[<64;30;12M')
  expect(s.focus).toBe('help')
  s.mouse = false
  expect(workspaceInput('[<65;30;12M', {} as Key, s, workspaceFrame(s, 120, 40, 0))).toEqual({})
})
