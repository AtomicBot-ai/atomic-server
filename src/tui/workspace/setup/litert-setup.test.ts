/** Guided setup with LiteRT-LM (spec litert-lm-server, "LiteRT-LM в TUI и admin"). */
import { describe, expect, it, vi } from 'vitest'
import { newSetup } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { setupAction } from './setup-actions.js'

const plan = (verdict = 'ok', blockers: string[] = []) => ({
  digest: 'plan-l1',
  origin: 'curated',
  model_id: 'gemma-4-e4b',
  name: 'Gemma 4 E4B',
  variant_id: 'gemma-4-e4b-gpu',
  backend: 'gpu',
  repo: 'litert-community/gemma-4-E4B-it-litert-lm',
  revision: '1'.repeat(40),
  gated: false,
  unverified: false,
  file: { path: 'gemma-4-E4B-it-gpu.litertlm', size: 3 * 1024 ** 3, sha256: 'a'.repeat(64) },
  verdict: { verdict, reason: verdict === 'ok' ? null : 'openvino is not prepared' },
  dir: '/data/litert-lm/models/gemma-4-e4b-gpu',
  present: false,
  download_bytes: 3 * 1024 ** 3,
  free_bytes: null,
  record: { tools: true, reasoning: true, vision: true },
  blockers,
})

function harness(installed: string[], reviewed = plan()) {
  let state = { ...createWorkspace('setup') }
  state.setup = { ...newSetup('server'), registered: ['llamacpp-upstream', 'litert-lm'], installed }
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    if (name === 'models.search' && input['engine'] === 'litert-lm')
      return {
        models: [
          {
            model_id: 'gemma-4-e4b',
            name: 'Gemma 4 E4B',
            unverified: false,
            default_variant: 'gemma-4-e4b-gpu',
            variants: [],
          },
          {
            model_id: 'litert-community/Qwen3-4B',
            name: 'Qwen3-4B',
            unverified: true,
            default_variant: null,
            variants: [],
          },
        ],
      }
    if (name === 'litert.plan') return reviewed
    if (name === 'litert.accelerators')
      return {
        installed: false,
        build: null,
        npu: null,
        accelerators: [],
        error: null,
        preparing: false,
        last_result: null,
        last_error: null,
        steps: [],
      }
    return { id: 'job' }
  })
  const setup = {
    savePath: vi.fn(async () => {}),
    readPath: vi.fn(async () => null),
    clearPath: vi.fn(async () => {}),
  }
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute, snapshot: async () => null, start: async () => ({ launch: 'terminal' }) },
      setup,
      api: vi.fn(async () => {}),
      localEndpoint: vi.fn(async () => 'http://127.0.0.1:1337/v1'),
      save: vi.fn(async () => {}),
      engineSelection: { remember: vi.fn(async () => {}) },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const calls = (name: string) => execute.mock.calls.filter(([n]) => n === name).map(([, i]) => i)
  const screen = () =>
    workspaceFrame(state, 120, 36, 0)
      .cells.map((r) => r.map((c) => c.char).join(''))
      .join('\n')
  return { ctx, calls, screen, get: () => state }
}

describe('guided setup with LiteRT-LM', () => {
  it('offers LiteRT-LM among the engines, and installs it first in its panel when it is absent', async () => {
    const t = harness([])
    expect(t.screen()).toMatch(/LiteRT-LM\s+\/\s+not installed/)
    await setupAction('setup-engine:litert-lm', t.ctx)
    expect(t.get()).toMatchObject({
      overlay: 'engine-panel',
      enginePanel: { engine: 'litert-lm', inSetup: true },
    })
  })

  it('lists its models in its own format, downloads the default variant without confirmation and loads it', async () => {
    const t = harness(['litert-lm'])
    await setupAction('setup-engine:litert-lm', t.ctx)
    expect(t.calls('models.search')).toEqual([{ engine: 'litert-lm', query: '' }])
    expect(t.screen()).toContain('gemma-4-e4b-gpu')
    expect(t.screen()).not.toMatch(/GGUF/)
    await setupAction('setup-path-repo:0', t.ctx)
    expect(t.calls('litert.plan')).toEqual([{ model: 'gemma-4-e4b' }])
    expect(t.screen()).toContain('gemma-4-e4b-gpu')
    expect(t.calls('litert.install')).toEqual([
      { request_id: expect.stringMatching(/^terminal-/), plan_digest: 'plan-l1' },
    ])
    expect(t.get().setup?.path?.job).toMatchObject({
      kind: 'litert-model',
      model: 'gemma-4-e4b-gpu',
      engine: 'litert-lm',
    })
    await setupAction('setup-path-finish', t.ctx)
    expect(t.calls('models.load')).toEqual([{ provider: 'litert-lm', model_id: 'gemma-4-e4b-gpu' }])
  })

  it.each([
    ['accelerator-not-prepared', 'Prepare accelerator'],
    ['engine-not-installed', 'Install LiteRT-LM'],
  ])('a variant that waits on %s leads to the LiteRT-LM panel', async (verdict, label) => {
    const t = harness(['litert-lm'], plan(verdict, ['Not runnable here yet.']))
    await setupAction('setup-engine:litert-lm', t.ctx)
    await setupAction('setup-path-repo:0', t.ctx)
    expect(t.screen()).toContain(label)
    await setupAction('setup-path-litert', t.ctx)
    expect(t.get()).toMatchObject({
      overlay: 'engine-panel',
      enginePanel: { engine: 'litert-lm', inSetup: true },
    })
  })
})
