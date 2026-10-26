/**
 * A clean machine's engine pickers (chat and Server → Choose engine) offered no LiteRT-LM or Foundry Local.
 * They are listed now, and an engine not installed yet opens its own panel: it installs there (and
 * prepares its accelerators), never on save.
 */
import { describe, expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { pickerRows } from './picker.js'
import { serverChoices } from '../server/server-settings.js'

const ENGINES = [
  {
    id: 'llamacpp-upstream|b2|vulkan',
    provider: 'llamacpp-upstream',
    version: 'b2',
    backend: 'vulkan',
    installed: true,
  },
  {
    id: 'foundry-local',
    provider: 'foundry-local',
    version: 'v2.1.0',
    backend: 'linux-x64',
    installed: false,
  },
  { id: 'litert-lm', provider: 'litert-lm', version: '', backend: '', installed: false },
]

function harness(page: 'chat' | 'server') {
  let state: WorkspaceState = { ...createWorkspace(page), setupComplete: true, engines: ENGINES }
  const execute = vi.fn(async (name: string) =>
    name === 'litert.accelerators' || name === 'foundry.accelerators' ? { accelerators: [] } : {}
  )
  const select = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: {
      installed: async () => [],
      models: async () => [],
      engineSelection: { list: async () => ENGINES, select },
      setup: { catalogs: async () => [], read: async () => ({ complete: true }) },
      runtime: { execute, start: async () => ({ launch: 'terminal' }), read: execute },
      loadModel: vi.fn(),
      save: vi.fn(),
    } as unknown as WorkspaceController,
  }
  return { ctx, execute, select, get: () => state }
}

describe('engines set up in their own panel', () => {
  it('are listed in both pickers as set up there, not installed on save', () => {
    const chat = { ...createWorkspace('chat'), engines: ENGINES, overlay: 'engine-picker' as const }
    expect(pickerRows(chat).map((r) => [r.title, r.detail])).toEqual([
      ['llama.cpp', 'b2 / vulkan · Installed'],
      ['Foundry Local', 'Not installed · Set up in its panel'],
      ['LiteRT-LM', 'Not installed · Set up in its panel'],
      ['Refresh engines', 'Check compatible builds'],
    ])
    const server = { ...createWorkspace('server'), engines: ENGINES, serverChoice: 'engine' as const }
    expect(serverChoices(server).map((c) => c.detail)).toEqual([
      'b2 / vulkan · Installed',
      'Not installed · Set up in its panel',
      'Not installed · Set up in its panel',
    ])
  })

  it('open the LiteRT-LM panel from the chat picker instead of queueing a download', async () => {
    const { ctx, execute, select, get } = harness('chat')
    ctx.update((s) => ({ ...s, overlay: 'engine-picker' }))
    await activate('pick-engine:2', ctx)
    expect(get()).toMatchObject({
      overlay: 'engine-panel',
      enginePanel: { engine: 'litert-lm', kind: 'litert' },
    })
    expect(execute).not.toHaveBeenCalledWith('engines.enqueue', expect.anything())
    expect(select).not.toHaveBeenCalled()
  })

  it('open the Foundry Local panel from Server → Choose engine instead of saving it', async () => {
    const { ctx, execute, get } = harness('server')
    ctx.update((s) => ({ ...s, overlay: 'server-choice', serverChoice: 'engine' }))
    await activate('server-choice:1', ctx)
    expect(get()).toMatchObject({
      overlay: 'engine-panel',
      enginePanel: { engine: 'foundry-local', kind: 'foundry' },
    })
    expect(get().serverDraft).toBeFalsy()
    expect(execute).not.toHaveBeenCalledWith('engines.enqueue', expect.anything())
  })
})
