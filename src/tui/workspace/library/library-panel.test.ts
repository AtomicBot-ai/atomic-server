/** The TUI Library for managed engines and Foundry Local (spec managed-models-server, foundry-local-server). */
import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it, vi } from 'vitest'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'

const REPO = 'Qwen/Qwen3.5-2B'
const verdict = (engine: string, installed: boolean, ok: boolean) => ({
  engine,
  installed,
  compatibility: {
    architectures: ['Qwen3ForCausalLM'],
    quantization_format: null,
    weight_bytes: 1024 ** 3,
    checked_gpu_id: 'GPU-0',
    curated: false,
    unified_memory: false,
    fits_other_gpus: [],
    verdict: ok
      ? { ok: true }
      : { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message: `${engine} refuses it` } },
  },
  error: null,
})

function tui(answers: Record<string, unknown>, over: Partial<ReturnType<typeof createWorkspace>> = {}) {
  let s = { ...createWorkspace('models'), setupComplete: true, ...over }
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    const a = answers[name]
    return typeof a === 'function' ? (a as (i: unknown) => unknown)(input) : (a ?? {})
  })
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: {
      runtime: { execute, snapshot: async () => s.workspace, start: async () => ({ launch: 'terminal' }) },
      // What the core's GGUF lookup does for a repository without GGUF files: it throws.
      files: vi.fn(async (repo: string) => {
        throw new AtomicCoreError('MODEL_NOT_FOUND', `No GGUF files found in Hugging Face repo ${repo}`)
      }),
      installed: vi.fn(async () => s.installed),
      models: vi.fn(async () => []),
      setup: { engines: vi.fn(async () => ['llamacpp-upstream', 'vllm', 'tensorrt-llm', 'foundry-local']) },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const calls = (name: string) => execute.mock.calls.filter(([n]) => n === name).map(([, i]) => i)
  const screen = () =>
    workspaceFrame(s, 120, 36, 0)
      .cells.map((r) => r.map((c) => c.char).join(''))
      .join('\n')
  return { ctx, calls, get: () => s, screen }
}
const catalogRow = {
  rows: [{ id: REPO, name: REPO, category: 'text', description: 'safetensors', source: {} }],
}

describe('the TUI catalog for managed engines', () => {
  it('leads a repository without GGUF to the plan of the installed engine that takes it', async () => {
    const t = tui({
      'models.catalog': catalogRow,
      'models.check': {
        repository: REPO,
        verdicts: [verdict('tensorrt-llm', false, false), verdict('vllm', true, true)],
      },
      'managed.plan': {
        digest: 'p1',
        repository: REPO,
        engine: 'vllm',
        download_bytes: 1024 ** 3,
        blockers: [],
        verdict: verdict('vllm', true, true),
      },
    })
    await activate('library:catalog', t.ctx)
    await activate('library-row:0', t.ctx)
    expect(t.calls('managed.plan')).toEqual([{ repository: REPO, engine: 'vllm' }])
    expect(t.get().overlay).toBeNull()
    expect(t.calls('managed.install')).toEqual([
      { request_id: expect.stringMatching(/^terminal-/), plan_digest: 'p1' },
    ])
  })

  it('offers to install the engine that would take it when no installed one does', async () => {
    const t = tui({
      'models.catalog': catalogRow,
      'models.check': {
        repository: REPO,
        verdicts: [verdict('tensorrt-llm', true, false), verdict('vllm', false, true)],
      },
      'engines.plan': { engine: 'vllm', plan: null, installation: null, operation: null },
    })
    await activate('library:catalog', t.ctx)
    await activate('library-row:0', t.ctx)
    expect(t.calls('managed.plan')).toEqual([])
    expect(t.get()).toMatchObject({ overlay: 'engine-panel', enginePanel: { engine: 'vllm' } })
    expect(t.get().enginePanel?.notice).toContain(REPO)
  })

  it('filters the text catalog by format, with safetensors from the managed engines and Foundry Local', async () => {
    const t = tui({
      'models.catalog': (i: Record<string, unknown>) =>
        i['engine'] === 'vllm'
          ? { engine: 'vllm', models: [{ repository: REPO, note: 'Qwen 2B', vram_tier_bytes: 0 }] }
          : catalogRow,
      'models.search': { models: [] },
    })
    await activate('library:catalog', t.ctx)
    expect(t.screen()).toMatch(/Filters/)
    await activate('library-filters', t.ctx)
    expect(t.screen()).toMatch(/SAFETENSORS/)
    expect(t.screen()).toMatch(/Foundry Local/)
    await activate('close', t.ctx)
    await activate('format:safetensors', t.ctx)
    expect(t.calls('models.catalog').at(-1)).toEqual({ engine: 'vllm' })
    expect(t.get().libraryRows.map((r) => r.id)).toEqual([REPO])
    await activate('library-refresh', t.ctx)
    expect(t.calls('models.catalog').at(-1)).toEqual({ engine: 'vllm' })
    expect(t.get().libraryRows.map((r) => r.id)).toEqual([REPO])
    await activate('format:foundry', t.ctx)
    expect(t.get()).toMatchObject({ overlay: null, libraryFormat: 'foundry', libraryView: 'catalog' })
    expect(t.calls('models.search').at(-1)).toEqual({ engine: 'foundry-local' })
  })

  it('lists a store model once with every provider, and warns that removing it removes it for all', async () => {
    const t = tui(
      { 'models.remove': { removed: true } },
      {
        libraryView: 'installed',
        installed: [
          {
            id: REPO,
            provider: 'vllm',
            name: REPO,
            providers: ['vllm', 'tensorrt-llm'],
            store: 'managed',
          } as never,
        ],
      }
    )
    expect(t.screen()).toContain(`${REPO}  vllm, tensorrt-llm`)
    await activate('library-remove', t.ctx)
    expect(t.get().overlay).toBe('remove-model')
    expect(t.screen()).toMatch(/every managed engine/)
    await activate('remove-model-confirm', t.ctx)
    expect(t.calls('models.remove')).toEqual([{ model_id: REPO }])
  })

  it('cancels a running store download and resumes an interrupted Foundry one from Downloads', async () => {
    const plan = { digest: 'pd' }
    const t = tui(
      {},
      {
        libraryView: 'downloads',
        workspace: {
          setups: [
            { id: 'm1', kind: 'managed-model', stage: 'downloading', plan: { ...plan, repository: REPO } },
            {
              id: 'f1',
              kind: 'foundry-model',
              stage: 'interrupted',
              plan: { ...plan, variant_id: 'phi-cpu' },
            },
          ],
          downloads: [],
        } as never,
      }
    )
    await activate('download-row:0', t.ctx)
    expect(t.get().overlay).toBe('download-detail')
    await activate('download-do:pause', t.ctx)
    expect(t.calls('managed.cancel')).toEqual([{ id: 'm1' }])
    t.ctx.update((v) => ({ ...v, page: 'models' }))
    await activate('download-row:1', t.ctx)
    await activate('download-do:resume', t.ctx)
    expect(t.calls('foundry.install')).toEqual([{ request_id: 'f1', plan_digest: 'pd' }])
  })
})
