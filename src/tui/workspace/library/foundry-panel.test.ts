import { describe, expect, it, vi } from 'vitest'
import type { FoundryAcceleratorsView } from '../../../contract/index.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { enginePanelModel } from './engine-panel-model.js'

const accelerators = (over: Partial<FoundryAcceleratorsView> = {}): FoundryAcceleratorsView =>
  ({
    installed: true,
    build: 'v2.1.0/win-x64',
    version: '2.1.0',
    c_api_version: 2,
    probed_at: 1,
    accelerators: [
      { name: 'OpenVINOExecutionProvider', execution_provider: 'openvino', device: 'npu', prepared: false },
    ],
    error: null,
    preparing: false,
    last_result: null,
    last_error: null,
    steps: [],
    ...over,
  }) as FoundryAcceleratorsView
const variant = (
  id: string,
  device: string,
  ep: string,
  verdict: string,
  accelerator: string | null = null
) => ({
  id,
  device,
  execution_provider: ep,
  asset_id: `azureml://${id}`,
  version: '3',
  size_bytes: 2 * 1024 ** 3,
  verdict: { verdict, reason: verdict === 'ok' ? null : 'see why', accelerator },
})
const SEARCH = {
  platform: 'win-x64',
  list_source: 'remote',
  list_error: null,
  catalog_unavailable: false,
  catalog_error: null,
  models: [
    {
      origin: 'microsoft',
      model_id: 'phi-4-mini',
      name: 'Phi 4 mini',
      summary: '',
      license: 'mit',
      unverified: true,
      variants: [
        variant(
          'phi-4-mini-openvino-npu',
          'npu',
          'openvino',
          'accelerator-not-prepared',
          'OpenVINOExecutionProvider'
        ),
        variant('phi-4-mini-cpu', 'cpu', 'cpu', 'ok'),
      ],
      default_variant: 'phi-4-mini-openvino-npu',
    },
  ],
}

function tui(view: FoundryAcceleratorsView, search: unknown = SEARCH) {
  let s = { ...createWorkspace('models'), setupComplete: true }
  s.libraryView = 'engines'
  s.libraryRows = [
    { id: 'foundry-local', name: 'foundry-local', category: 'engines', description: 'v2.1.0 · win-x64' },
  ]
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    if (name === 'foundry.accelerators') return view
    if (name === 'foundry.prepare') return { ...view, preparing: true }
    if (name === 'models.search') return search
    if (name === 'foundry.plan')
      return {
        digest: 'plan-1',
        name: 'Phi 4 mini',
        variant_id: input['variant'],
        device: 'cpu',
        execution_provider: 'cpu',
        files: [{ path: 'model.onnx', size: 10 }],
        pending: ['model.onnx'],
        download_bytes: 10,
        unverified: true,
        blockers: [],
        verdict: { verdict: 'ok', reason: null, accelerator: null },
      }
    return {}
  })
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    controller: {
      runtime: { execute, snapshot: async () => null, start: async () => ({ launch: 'terminal' }) },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  const model = () => enginePanelModel(s.enginePanel!, s.workspace)
  const text = () =>
    model()
      .lines.map((l) => l.text)
      .join('\n')
  const ids = () => [...model().buttons, ...(model().fields ?? [])].map((b) => b.id)
  return { ctx, execute, get: () => s, model, text, ids }
}
const calls = (t: ReturnType<typeof tui>, name: string) =>
  t.execute.mock.calls.filter(([n]) => n === name).map(([, input]) => input)

describe('Foundry Local in the TUI', () => {
  it('lists the accelerators and prepares them in the server, showing each step', async () => {
    const t = tui(accelerators())
    await activate('library-row:0', t.ctx)
    expect(t.text()).toContain('OpenVINO NPU: not prepared')
    await activate('foundry-prepare', t.ctx)
    expect(calls(t, 'foundry.prepare')).toEqual([{}])
    t.ctx.update((v) => ({
      ...v,
      enginePanel: {
        ...v.enginePanel!,
        foundry: {
          ...v.enginePanel!.foundry!,
          view: accelerators({
            preparing: true,
            steps: [
              { accelerator: 'OpenVINOExecutionProvider', stage: 'downloading', fraction: 0.5 },
            ] as never,
          }),
        },
      },
    }))
    expect(t.text()).toContain('OpenVINOExecutionProvider: downloading 50%')
    expect(t.ids()).not.toContain('foundry-prepare')
  })

  it('installs Foundry Local when it is not installed, then prepares its accelerators', async () => {
    const t = tui(accelerators({ installed: false, accelerators: [] }))
    await activate('library-row:0', t.ctx)
    await activate('foundry-install', t.ctx)
    expect(calls(t, 'engines.install')).toEqual([{ engine: 'foundry-local' }])
    expect(calls(t, 'foundry.prepare')).toEqual([{}])
  })

  it('updates the build and prepares the accelerators after it, as the install does', async () => {
    const t = tui(accelerators())
    await activate('library-row:0', t.ctx)
    await activate('foundry-update', t.ctx)
    expect(calls(t, 'engines.install')).toEqual([{ engine: 'foundry-local' }])
    expect(calls(t, 'foundry.prepare')).toEqual([{}])
  })

  it('lists models with their variants, verdicts and the unverified mark', async () => {
    const t = tui(accelerators())
    await activate('library-row:0', t.ctx)
    await activate('foundry-models', t.ctx)
    expect(calls(t, 'models.search')).toEqual([{ engine: 'foundry-local' }])
    const labels = (t.model().fields ?? []).map((f) => f.label).join('\n')
    expect(labels).toMatch(/Phi 4 mini · OpenVINO NPU .*accelerator-not-prepared.*unverified/)
    expect(labels).toMatch(/Phi 4 mini · CPU .*ok/)
  })

  it('reviews a runnable variant and downloads it in the server', async () => {
    const t = tui(accelerators())
    await activate('library-row:0', t.ctx)
    await activate('foundry-models', t.ctx)
    await activate('foundry-variant:phi-4-mini:phi-4-mini-cpu', t.ctx)
    expect(calls(t, 'foundry.plan')).toEqual([{ model: 'phi-4-mini', variant: 'phi-4-mini-cpu' }])
    expect(t.text()).toContain('unverified')
    await activate('foundry-download', t.ctx)
    expect(calls(t, 'foundry.install')).toEqual([
      { request_id: expect.stringMatching(/^terminal-/), plan_digest: 'plan-1' },
    ])
    expect(t.get()).toMatchObject({ overlay: null, libraryView: 'downloads', enginePanel: null })
  })

  it('leads a variant on an unprepared accelerator to Prepare, and one without the engine to Install', async () => {
    const t = tui(accelerators())
    await activate('library-row:0', t.ctx)
    await activate('foundry-models', t.ctx)
    await activate('foundry-variant:phi-4-mini:phi-4-mini-openvino-npu', t.ctx)
    expect(t.get().enginePanel?.mode).toBe('engine')
    expect(t.text()).toMatch(/OpenVINOExecutionProvider/)
    expect(t.ids()).toContain('foundry-prepare')
    expect(calls(t, 'foundry.plan')).toEqual([])
  })
})
