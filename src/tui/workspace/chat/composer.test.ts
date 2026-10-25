import { expect, it } from 'vitest'
import type { Key } from 'ink'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { createWorkspace } from '../state.js'
import { eyeSize } from '../draw/art.js'

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [180, 56],
  [240, 70],
])('keeps composer controls inside the frame and independently clickable at %ix%i', (width, height) => {
  const s = {
      ...createWorkspace('chat'),
      draft: 'Hello',
      model: 'qwen',
      workspace: {
        api: { running: true },
        services: [{ id: 'q', model: 'qwen', provider: 'llamacpp-upstream', kind: 'chat', state: 'ready' }],
        setups: [],
        downloads: [],
      } as never,
    },
    frame = workspaceFrame(s, width, height, 0)
  const controls = ['composer', 'send', 'attachments', 'chat-features', 'choose-model'].map((id) =>
    frame.targets.find((t) => t.id === id)!
  )
  const bottom = height - 4
  for (const t of controls) {
    expect(t.y).toBeGreaterThan(3)
    expect(t.y + t.height).toBeLessThanOrEqual(bottom - 1)
    expect(workspaceInput(`[<0;${t.x + 1};${t.y + 1}M`, {} as Key, s, frame).action).toBe(t.id)
    if (t.id !== 'composer') {
      s.focus = t.id
      expect(workspaceInput('', { return: true } as Key, s, frame).action).toBe(t.id)
    }
    for (const other of controls.filter((other) => other !== t)) {
      expect(
        t.x >= other.x + other.width ||
          t.x + t.width <= other.x ||
          t.y >= other.y + other.height ||
          t.y + t.height <= other.y
      ).toBe(true)
    }
  }
})

it('centers a new conversation and keeps Send hidden until there is a draft', () => {
  const state = createWorkspace('chat')
  const empty = workspaceFrame(state, 120, 36, 0)
  expect(empty.targets.some((target) => target.id === 'send' || target.id === 'choose-engine')).toBe(false)
  const conversation = workspaceFrame(
    { ...state, messages: [{ role: 'user', content: 'Hello' }] },
    120,
    36,
    0
  )
  expect(empty.targets.find((target) => target.id === 'composer')!.y).toBeLessThan(
    conversation.targets.find((target) => target.id === 'composer')!.y
  )
})

it('fits a stable visual eye proportion inside two thirds of roomy bounds', () => {
  for (const [width, height] of [
    [100, 20],
    [180, 45],
    [240, 65],
    [500, 100],
  ]) {
    const size = eyeSize(width!, height!)
    expect(size.width).toBeLessThanOrEqual(Math.floor((width! * 2) / 3))
    expect(size.height).toBeLessThanOrEqual(Math.floor((height! * 2) / 3))
    expect(Math.abs((size.width * 0.96) / (size.height * 2) - 4 / 3)).toBeLessThan(0.04)
  }
  expect(eyeSize(46, 5).height).toBe(5)
})
