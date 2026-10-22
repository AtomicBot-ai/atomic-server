import { describe, expect, it, vi } from 'vitest'
import type { LiteRtAcceleratorsView, LiteRtSearchResult } from '../../../contract/index.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import { enginePanelModel } from './engine-panel-model.js'

const OPENVINO = {
  name: 'openvino',
  device: 'npu',
  version: '2026.4.1',
  size_bytes: 85 * 1024 ** 2,
  prepared: false,
}
const accelerators = (over: Partial<LiteRtAcceleratorsView> = {}): LiteRtAcceleratorsView => ({
  installed: true,
  build: '0.18.1/win-x64',
  npu: 'intel-lnl',
  accelerators: [OPENVINO],
  error: null,
  preparing: false,
  last_result: null,
  last_error: null,
  steps: [],
  ...over,
})
const LINUX = accelerators({ build: '0.18.1/linux-x64', npu: null, accelerators: [] })
const variant = (id: string, backend: string, verdict: string, npu?: string) => ({
  id,
  backend,
  ...(npu ? { npu } : {}),
  file: { path: `${id}.litertlm`, size: 3 * 1024 ** 3, sha256: 'a'.repeat(64) },
  verdict: { verdict, reason: verdict === 'ok' ? null : 'see why' },
})
const SEARCH = {
  platform: 'win-x64',
  list_source: 'remote',
  list_error: null,
  huggingface: true,
  huggingface_unavailable: false,
  huggingface_error: null,
  models: [
    {
      origin: 'curated',
      model_id: 'gemma-4-e4b',
      name: 'Gemma 4 E4B',
      summary: '',
      license: 'gemma',
      gated: false,
      unverified: false,
      repo: 'litert-community/gemma-4-E4B-it-litert-lm',
      revision: '1'.repeat(40),
      variants: [
        variant('gemma-4-e4b-npu-lnl', 'npu', 'accelerator-not-prepared', 'intel-lnl'),
        variant('gemma-4-e4b-cpu', 'cpu', 'ok'),
      ],
      default_variant: 'gemma-4-e4b-npu-lnl',
    },
    {
      origin: 'huggingface',
      model_id: 'litert-community/Qwen3-4B',
      name: 'Qwen3-4B',
      summary: '',
      license: 'apache-2.0',
      gated: false,
      unverified: true,
      repo: 'litert-community/Qwen3-4B',
      revision: '2'.repeat(40),
      variants: [variant('qwen3-4b-cpu', 'cpu', 'engine-not-installed')],
      default_variant: null,
    },
  ],
} as unknown as LiteRtSearchResult

function tui(views: LiteRtAcceleratorsView[]) {
  let s = { ...createWorkspace('models'), setupComplete: true }
  s.libraryView = 'engines'
  s.libraryRows = [
    { id: 'litert-lm', name: 'litert-lm', category: 'engines', description: '0.18.1 · win-x64' },
  ]
  let read = 0
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    if (name === 'litert.accelerators') return views[Math.min(read++, views.length - 1)]
    if (name === 'litert.prepare') return { ...views.at(-1)!, preparing: true }
    if (name === 'models.search') return SEARCH
    if (name === 'litert.plan')
      return {
        digest: 'plan-1',
        name: 'Gemma 4 E4B',
        variant_id: input['model'] === 'gemma-4-e4b' ? 'gemma-4-e4b-cpu' : input['model'],
        backend: 'cpu',
        file: { path: 'gemma-4-E4B-it.litertlm', size: 10, sha256: 'a'.repeat(64) },
        download_bytes: 10,
        present: false,
        unverified: false,
        blockers: [],
        verdict: { verdict: 'ok', reason: null },
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

describe('LiteRT-LM in the TUI', () => {
  it('shows the build and says a Linux host has nothing to prepare', async () => {
    const t = tui([LINUX])
    await activate('library-row:0', t.ctx)
    expect(t.text()).toContain('Installed: 0.18.1/linux-x64')
    expect(t.text()).toMatch(/nothing to prepare/i)
    expect(t.ids()).not.toContain('litert-prepare')
    expect(t.ids()).toContain('litert-models')
  })

  it('lists openvino on an Intel NPU and prepares it in the server, showing its step', async () => {
    const t = tui([accelerators()])
    await activate('library-row:0', t.ctx)
    expect(t.text()).toContain('NPU: intel-lnl')
    expect(t.text()).toMatch(/openvino 2026\.4\.1 .*not prepared/)
    await activate('litert-prepare', t.ctx)
    expect(calls(t, 'litert.prepare')).toEqual([{}])
    t.ctx.update((v) => ({
      ...v,
      enginePanel: {
        ...v.enginePanel!,
        litert: {
          ...v.enginePanel!.litert!,
          view: accelerators({
            preparing: true,
            steps: [{ accelerator: 'openvino', stage: 'downloading', fraction: 0.5 }],
          }),
        },
      },
    }))
    expect(t.text()).toContain('openvino: downloading 50%')
    expect(t.ids()).not.toContain('litert-prepare')
  })

  it('installs LiteRT-LM, then prepares openvino only where the core offers it', async () => {
    const linux = tui([{ ...LINUX, installed: false, build: null }, LINUX])
    await activate('library-row:0', linux.ctx)
    await activate('litert-install', linux.ctx)
    expect(calls(linux, 'engines.install')).toEqual([{ engine: 'litert-lm' }])
    expect(calls(linux, 'litert.prepare')).toEqual([])
    const windows = tui([accelerators({ installed: false, build: null, accelerators: [] }), accelerators()])
    await activate('library-row:0', windows.ctx)
    await activate('litert-install', windows.ctx)
    expect(calls(windows, 'litert.prepare')).toEqual([{}])
  })

  it('lists models with their variants, verdicts and the unverified mark', async () => {
    const t = tui([accelerators()])
    await activate('library-row:0', t.ctx)
    await activate('litert-models', t.ctx)
    expect(calls(t, 'models.search')).toEqual([{ engine: 'litert-lm' }])
    const labels = (t.model().fields ?? []).map((f) => f.label).join('\n')
    expect(labels).toMatch(/\* Gemma 4 E4B · NPU \(intel-lnl\) .*accelerator-not-prepared/)
    expect(labels).toMatch(/Gemma 4 E4B · CPU .*ok/)
    expect(labels).toMatch(/Qwen3-4B · CPU .*unverified/)
  })

  it('reviews a runnable variant and downloads it in the server', async () => {
    const t = tui([accelerators()])
    await activate('library-row:0', t.ctx)
    await activate('litert-models', t.ctx)
    await activate('litert-variant:gemma-4-e4b:gemma-4-e4b-cpu', t.ctx)
    expect(calls(t, 'litert.plan')).toEqual([{ model: 'gemma-4-e4b', variant: 'gemma-4-e4b-cpu' }])
    await activate('litert-download', t.ctx)
    expect(calls(t, 'litert.install')).toEqual([
      { request_id: expect.stringMatching(/^terminal-/), plan_digest: 'plan-1' },
    ])
    expect(t.get()).toMatchObject({ overlay: null, libraryView: 'downloads', enginePanel: null })
  })

  it('leads a variant waiting on openvino to Prepare, and one without the engine to Install', async () => {
    const t = tui([accelerators()])
    await activate('library-row:0', t.ctx)
    await activate('litert-models', t.ctx)
    await activate('litert-variant:gemma-4-e4b:gemma-4-e4b-npu-lnl', t.ctx)
    expect(t.get().enginePanel?.mode).toBe('engine')
    expect(t.text()).toMatch(/prepare/i)
    expect(t.ids()).toContain('litert-prepare')
    await activate('litert-models', t.ctx)
    await activate('litert-variant:litert-community/Qwen3-4B:qwen3-4b-cpu', t.ctx)
    expect(t.text()).toMatch(/Install LiteRT-LM first/)
    expect(calls(t, 'litert.plan')).toEqual([])
  })
})
