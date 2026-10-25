/** Cases from the October 2026 bug hunt over the terminal UI: each one failed before its fix. */
import type { Key } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { newSetup } from '../../terminal-setup/index.js'
import { activate } from './actions.js'
import type { ActionContext } from './actions.js'
import type { WorkspaceController } from './controller.js'
import { workspaceFrame } from './frame.js'
import { workspaceInput } from './input.js'
import { createWorkspace } from './state.js'
import type { WorkspaceState } from './state.js'

const key = (value: Partial<Key> = {}) => value as Key
const screenOf = (s: WorkspaceState, w = 100, h = 30) =>
  workspaceFrame(s, w, h, 0)
    .cells.map((row) => row.map((cell) => cell.char).join(''))
    .join('\n')

function context(state: WorkspaceState, controller: Record<string, unknown> = {}) {
  let s = state
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: controller as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return { ctx, get: () => s }
}

describe('the guided path download screen', () => {
  const state = (transferred: number): WorkspaceState => ({
    ...createWorkspace('models'),
    setupComplete: true,
    setup: {
      ...newSetup('server'),
      stage: 'download',
      path: {
        engine: 'vllm',
        kind: 'managed',
        rows: [],
        plan: null,
        job: { id: 'j1', kind: 'managed-model', engine: 'vllm', model: 'org/model' },
      },
    } as never,
    workspace: {
      setups: [{ id: 'j1', stage: 'downloading', plan: { download_bytes: 100 } }],
      downloads: [{ taskId: 'j1', transferred, total: 150 }],
    } as never,
  })

  it('draws a transfer past the plan’s byte count as a full bar instead of throwing', () => {
    expect(() => workspaceFrame(state(150), 100, 30, 0)).not.toThrow()
    expect(screenOf(state(150))).toMatch(/\[#+\]/)
  })

  it('draws only controls the keyboard can reach: focus lands on one of them', () => {
    const f = workspaceFrame({ ...state(50), focus: 'setup-cancel' }, 100, 30, 0)
    expect(f.targets.map((t) => t.id)).not.toContain('setup-cancel')
    const result = workspaceInput('', key({ return: true }), { ...state(50), focus: 'setup-cancel' }, f)
    expect(result.action).toBeUndefined()
    expect(result.patch?.focus).toBe(f.targets[0]?.id)
  })
})

describe('keys that no longer point at a drawn control', () => {
  it('moves focus to the first control instead of activating it', () => {
    const s = { ...createWorkspace('server'), focus: 'a-control-that-left' }
    const f = workspaceFrame(s, 100, 30, 0)
    expect(workspaceInput('', key({ return: true }), s, f)).toEqual({
      patch: { focus: f.targets[0]?.id, hover: '' },
    })
  })
})

describe('navigation that finishes after the user moved on', () => {
  it('does not pull the user back to Models when the catalog answers late', async () => {
    let answer!: (rows: unknown) => void
    const { ctx, get } = context(
      { ...createWorkspace('server'), setupComplete: true },
      {
        installed: async () => [],
        models: async () => [],
        setup: { engines: async () => ['llamacpp-upstream'] },
        runtime: { execute: () => new Promise((resolve) => (answer = resolve)) },
      }
    )
    const navigation = activate('page:models', ctx)
    await vi.waitFor(() => expect(typeof answer).toBe('function'))
    await activate('page:server', ctx)
    answer([])
    await navigation
    expect(get().page).toBe('server')
  })

  it('does not show the catalog’s rows in the engines view the user switched to', async () => {
    const pending: Array<(rows: unknown) => void> = []
    const { ctx, get } = context(
      { ...createWorkspace('models'), setupComplete: true, libraryEngines: ['llamacpp-upstream'] },
      {
        installed: async () => [],
        setup: { engines: async () => ['llamacpp-upstream'] },
        runtime: {
          execute: (name: string) =>
            name === 'models.catalog'
              ? new Promise((resolve) => pending.push(resolve))
              : Promise.resolve({ engines: [{ engine: 'llamacpp-upstream', kind: 'llamacpp' }] }),
        },
      }
    )
    const slow = activate('library:catalog', ctx)
    await activate('library:engines', ctx)
    const engines = get().libraryRows.map((r) => r.id)
    pending.forEach((resolve) => resolve([{ id: 'late/model', name: 'Late' }]))
    await slow
    expect(get().libraryView).toBe('engines')
    expect(get().libraryRows.map((r) => r.id)).toEqual(engines)
  })
})

describe('a revealed secret', () => {
  it('is dropped when the page changes, so its timer closes nothing later', async () => {
    const { ctx, get } = context(
      { ...createWorkspace('keys'), setupComplete: true, secret: 'tok', overlay: 'credential' },
      {
        run: async () => undefined,
        models: async () => [],
        installed: async () => [],
        runtime: { execute: async () => ({}) },
      }
    )
    await activate('page:server', ctx)
    expect(get().secret).toBe('')
  })
})

describe('a key name confirmed twice', () => {
  it('creates one key', async () => {
    const create = vi.fn(async () => ({ id: 'k', token: 't', name: 'n', createdAt: 1 }))
    const { ctx } = context(
      {
        ...createWorkspace('keys'),
        setupComplete: true,
        overlay: 'endpoint',
        edit: 'key-name',
        editValue: 'n',
        focus: 'save-edit',
      },
      { keys: { create, list: async () => [] }, save: vi.fn() }
    )
    await Promise.all([activate('save-edit', ctx), activate('save-edit', ctx)])
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('the first run’s destination cards at 54×24 with a download running', () => {
  it('still names both destinations with a reachable control each', () => {
    const s: WorkspaceState = {
      ...createWorkspace('welcome'),
      firstRun: 'connect',
      model: 'qwen',
      workspace: {
        setups: [{ id: 'd', stage: 'downloading', plan: { model_id: 'qwen', total_download_bytes: 100 } }],
        downloads: [{ taskId: 'd', transferred: 10, total: 100 }],
      } as never,
    }
    const f = workspaceFrame(s, 54, 24, 0)
    expect(screenOf(s, 54, 24)).toContain('Configure an endpoint')
    expect(f.targets.find((t) => t.id === 'first-connect:endpoint')?.height).toBeGreaterThanOrEqual(2)
  })
})
