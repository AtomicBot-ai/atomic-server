/** Guided setup for a managed engine or Foundry Local (spec managed-models-server, foundry-local-server). */
import { describe, expect, it, vi } from 'vitest'
import { installation } from '../../../../test/helpers/managed-fixtures.js'
import { newSetup } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { enginePanelModel } from '../library/engine-panel-model.js'
import { createWorkspace } from '../state.js'
import { pathJob } from './engine-setup.js'
import { setupAction } from './setup-actions.js'

const REPO = 'Qwen/Qwen3.5-2B'
const managedPlan = {
  digest: 'plan-d1',
  repository: REPO,
  revision: 'abc',
  engine: 'vllm',
  architectures: ['Qwen3ForCausalLM'],
  root: '/data/managed-models',
  files: [{ path: 'model.safetensors', size: 4 * 1024 ** 3, sha256: 'x' }],
  pending: ['model.safetensors'],
  download_bytes: 4 * 1024 ** 3,
  free_bytes: null,
  present: false,
  blockers: [],
  verdict: {
    engine: 'vllm',
    installed: true,
    compatibility: {
      weight_bytes: 4 * 1024 ** 3,
      checked_gpu_id: 'GPU-0',
      fits_other_gpus: [],
      architectures: ['Qwen3ForCausalLM'],
      quantization_format: null,
      curated: true,
      unified_memory: false,
      verdict: { ok: true },
    },
    error: null,
  },
}
const foundryPlan = {
  digest: 'plan-f1',
  model_id: 'phi-4-mini',
  name: 'Phi 4 mini',
  variant_id: 'phi-4-mini-cpu',
  device: 'cpu',
  execution_provider: 'cpu',
  files: [{ path: 'model.onnx', size: 10 }],
  pending: ['model.onnx'],
  download_bytes: 10,
  unverified: false,
  blockers: [],
  verdict: { verdict: 'ok', reason: null, accelerator: null },
}

function harness(installed: string[], plan: object = foundryPlan) {
  let state = { ...createWorkspace('setup') }
  state.setup = {
    ...newSetup('server'),
    registered: ['llamacpp-upstream', 'vllm', 'foundry-local'],
    installed,
  }
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    if (name === 'models.catalog')
      return {
        engine: 'vllm',
        models: [{ repository: REPO, note: 'Qwen 2B', vram_tier_bytes: 8 * 1024 ** 3 }],
      }
    if (name === 'models.search' && input['engine'] === 'foundry-local')
      return {
        models: [
          {
            model_id: 'phi-4-mini',
            name: 'Phi 4 mini',
            unverified: false,
            default_variant: 'phi-4-mini-cpu',
            variants: [],
          },
        ],
      }
    if (name === 'models.search') return { rows: [] }
    if (name === 'managed.plan') return managedPlan
    if (name === 'models.check')
      return {
        repository: input['repository'],
        verdicts: [
          managedPlan.verdict,
          {
            engine: 'tensorrt-llm',
            installed: false,
            compatibility: null,
            error: { code: 'MODEL_INCOMPATIBLE', message: 'tensorrt-llm takes no Qwen3.5' },
          },
        ],
      }
    if (name === 'foundry.plan') return plan
    if (name === 'engines.plan')
      return { engine: input['engine'], plan: null, installation: null, operation: null }
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
  return { ctx, execute, setup, calls, get: () => state }
}
const screen = (s: ReturnType<typeof createWorkspace>) =>
  workspaceFrame(s, 120, 36, 0)
    .cells.map((r) => r.map((c) => c.char).join(''))
    .join('\n')

describe('guided setup with a managed engine', () => {
  it('takes a model for vLLM: its verdict, the plan, the download, then loads it in vLLM', async () => {
    const t = harness(['vllm'])
    await setupAction('setup-engine:vllm', t.ctx)
    expect(t.calls('models.catalog')).toEqual([{ engine: 'vllm' }])
    expect(t.get().setup).toMatchObject({ stage: 'models', path: { engine: 'vllm', kind: 'managed' } })
    expect(screen(t.get())).toContain(REPO)
    expect(screen(t.get())).not.toMatch(/GGUF/)
    await setupAction('setup-path-repo:0', t.ctx)
    expect(t.calls('managed.plan')).toEqual([{ repository: REPO, engine: 'vllm' }])
    expect(t.get().setup?.stage).toBe('download')
    expect(t.get().page).toBe('welcome')
    expect(screen(t.get())).toContain(REPO)
    // Compatibility is still checked; unrelated engine verdicts stay out of the download screen.
    expect(t.calls('models.check')).toEqual([{ repository: REPO }])
    expect(screen(t.get())).not.toContain('tensorrt-llm takes no Qwen3.5')
    expect(t.calls('managed.install')).toEqual([
      { request_id: expect.stringMatching(/^terminal-/), plan_digest: 'plan-d1' },
    ])
    const job = t.get().setup?.path?.job
    expect(job).toMatchObject({ kind: 'managed-model', model: REPO, engine: 'vllm' })
    expect(t.setup.savePath).toHaveBeenCalledWith(job)
    expect(t.get().setup?.stage).toBe('download')
    await setupAction('setup-path-finish', t.ctx)
    expect(t.calls('models.load')).toEqual([{ provider: 'vllm', model_id: REPO }])
    expect(t.calls('setup.complete')).toEqual([{ model_id: REPO }])
    expect(t.get()).toMatchObject({ setup: null, model: REPO, setupComplete: true })
    expect(t.setup.clearPath).toHaveBeenCalled()
  })

  it('follows the job from the snapshot: its stage and bytes', () => {
    const setup = {
      ...newSetup('server'),
      path: {
        engine: 'vllm',
        kind: 'managed' as const,
        rows: [],
        plan: null,
        job: { id: 'j1', kind: 'managed-model' as const, model: REPO, engine: 'vllm' },
      },
    }
    const snapshot = {
      setups: [{ id: 'j1', kind: 'managed-model', stage: 'downloading', plan: managedPlan }],
      downloads: [{ taskId: 'j1', transferred: 1024 ** 3, total: 4 * 1024 ** 3 }],
    }
    expect(pathJob(setup, snapshot as never)).toMatchObject({
      stage: 'downloading',
      done: 1024 ** 3,
      total: 4 * 1024 ** 3,
    })
  })

  it('installs an engine that is not installed first, in its panel, then goes on to the models', async () => {
    const t = harness([])
    await setupAction('setup-engine:vllm', t.ctx)
    expect(t.get()).toMatchObject({ overlay: 'engine-panel', enginePanel: { engine: 'vllm', inSetup: true } })
    const ready = {
      engines: [{ engine: 'vllm', installation: installation('vllm'), operation: null }],
      host_steps: [],
    }
    const panel = { ...t.get().enginePanel!, state: { ...t.get().enginePanel!.state!, plan: null } as never }
    expect(enginePanelModel(panel, ready as never).buttons.map((b) => b.id)).toContain('setup-path-continue')
  })
})

describe('guided setup with Foundry Local', () => {
  it('lists its models and downloads the default variant without confirmation', async () => {
    const t = harness(['foundry-local'])
    await setupAction('setup-engine:foundry-local', t.ctx)
    expect(t.calls('models.search')).toEqual([{ engine: 'foundry-local', query: '' }])
    await setupAction('setup-path-repo:0', t.ctx)
    expect(t.calls('foundry.plan')).toEqual([{ model: 'phi-4-mini' }])
    expect(screen(t.get())).toContain('phi-4-mini-cpu')
    expect(t.calls('foundry.install')).toEqual([
      { request_id: expect.stringMatching(/^terminal-/), plan_digest: 'plan-f1' },
    ])
    expect(t.get().setup?.path?.job).toMatchObject({
      kind: 'foundry-model',
      model: 'phi-4-mini-cpu',
      engine: 'foundry-local',
    })
  })
  it.each([
    ['accelerator-not-prepared', 'Prepare accelerators'],
    ['engine-not-installed', 'Install Foundry Local'],
  ])('a variant that waits on %s leads to the Foundry Local panel, then back', async (verdict, label) => {
    const waiting = {
      ...foundryPlan,
      verdict: { verdict, reason: null, accelerator: 'OpenVINO NPU' },
      blockers: ['Not runnable here yet.'],
    }
    const t = harness(['foundry-local'], waiting)
    await setupAction('setup-engine:foundry-local', t.ctx)
    await setupAction('setup-path-repo:0', t.ctx)
    expect(screen(t.get())).toContain(label)
    expect(workspaceFrame(t.get(), 120, 36, 0).targets.some((t) => t.id === 'setup-path-install')).toBe(false)
    await setupAction('setup-path-foundry', t.ctx)
    expect(t.get()).toMatchObject({
      overlay: 'engine-panel',
      enginePanel: { engine: 'foundry-local', inSetup: true },
    })
  })
})

describe('a guided-setup download that did not finish', () => {
  const job = { id: 'j1', kind: 'managed-model' as const, model: REPO, engine: 'vllm' }
  const stopped = (stage: string) =>
    ({ setups: [{ id: 'j1', kind: 'managed-model', stage, plan: { digest: 'p1' } }], downloads: [] }) as never

  it('resumes the same job, or lets go of it and returns to the engines', async () => {
    const t = harness(['vllm'])
    t.ctx.update((s) => ({
      ...s,
      workspace: stopped('interrupted'),
      setup: {
        ...s.setup!,
        stage: 'download',
        path: { engine: 'vllm', kind: 'managed', rows: [], plan: null, job },
      },
    }))
    const targets = workspaceFrame(t.get(), 120, 36, 0).targets.map((x) => x.id)
    expect(targets).toEqual(expect.arrayContaining(['setup-path-resume', 'setup-path-abandon']))
    await setupAction('setup-path-resume', t.ctx)
    expect(t.calls('managed.install')).toEqual([{ request_id: 'j1', plan_digest: 'p1' }])
    await setupAction('setup-path-abandon', t.ctx)
    expect(t.setup.clearPath).toHaveBeenCalled()
    expect(t.get().setup).toMatchObject({ stage: 'engine', path: null })
  })

  it('offers Retry when loading the finished model failed', () => {
    const t = harness(['vllm'])
    t.ctx.update((s) => ({
      ...s,
      workspace: stopped('ready'),
      setup: {
        ...s.setup!,
        stage: 'download',
        error: 'load failed',
        path: { engine: 'vllm', kind: 'managed', rows: [], plan: null, job },
      },
    }))
    expect(workspaceFrame(t.get(), 120, 36, 0).targets.map((x) => x.id)).toContain('setup-path-finish')
  })
})
