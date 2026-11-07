import { expect, it, vi } from 'vitest'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import type { ActionContext } from '../actions.js'
import { libraryAction } from './library-actions.js'
import { catalogFilterControls, catalogIndexes } from './catalog-filters.js'
import { catalogDeviceStatus } from './model-job.js'
import { withInstalledRows } from './catalog-installed.js'

const formats = ['gguf', 'mlx', 'safetensors', 'foundry', 'litert', 'geniex', 'fastflowlm'] as const
const rows = formats.map((format) => ({
  id: format,
  name: format,
  description: '',
  category: 'text',
  source: { format },
}))
function fixture() {
  let state: WorkspaceState = {
    ...createWorkspace('models'),
    setupComplete: true,
    libraryRows: rows,
    libraryEngines: ['llamacpp-upstream', 'mlx', 'fastflowlm', 'audio-cpp', 'sd-cpp'],
  }
  const execute = vi.fn(
    async (name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> =>
      name === 'models.search'
        ? { models: [{ model_id: input.engine, name: 'Qwen ' + input.engine }] }
        : { rows }
  )
  const write = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: {
      runtime: { execute },
      catalogPreferences: { write },
      installed: async () => [],
      models: async () => [],
      setup: { engines: async () => state.libraryEngines },
    } as unknown as WorkspaceController,
  }
  return { ctx, execute, write, get: () => state, action: (id: string) => libraryAction(id, ctx) }
}
const shown = (s: WorkspaceState) => catalogIndexes(s).map((i) => s.libraryRows[i]!.id)
function deferred() {
  let resolve!: (value: never) => void
  let reject!: (error: Error) => void
  const promise = new Promise<never>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve: (value: unknown) => resolve(value as never), reject }
}

it.each(formats)('shows only %s, including installed rows', (format) => {
  const s = createWorkspace('models')
  s.libraryFormat = format
  s.installed = [
    { id: 'local-gguf', provider: 'llamacpp-upstream', name: 'GGUF' },
    { id: 'local-mlx', provider: 'mlx', name: 'MLX' },
    { id: 'local-flm', provider: 'fastflowlm', name: 'FLM' },
  ]
  s.libraryRows = withInstalledRows(rows, s)
  expect(shown(s)).toEqual([
    ...((
      { gguf: ['local-gguf'], mlx: ['local-mlx'], fastflowlm: ['local-flm'] } as Partial<
        Record<string, string[]>
      >
    )[format] ?? []),
    format,
  ])
})
it('does not offer audio or diffusion engines as text/GGUF filters', () => {
  const controls = catalogFilterControls(fixture().get()).map(([id]) => id)
  expect(controls).not.toContain('filter-engine:audio-cpp')
  expect(controls).not.toContain('filter-engine:sd-cpp')
  expect(controls).toContain('filter-engine:fastflowlm')
})
it('keeps the chosen format on reentry and refresh and searches its own catalog', async () => {
  const t = fixture()
  await t.action('filter-format:fastflowlm')
  await t.action('page:models')
  expect(t.get().libraryFormat).toBe('fastflowlm')
  await t.action('library-refresh')
  t.ctx.update((s) => ({ ...s, edit: 'library-query', editValue: 'qwen' }))
  await t.action('save-edit')
  expect(t.execute.mock.calls.every(([name]) => name === 'models.search')).toBe(true)
  expect(t.execute).toHaveBeenLastCalledWith('models.search', { engine: 'fastflowlm', query: 'qwen' })
  expect(shown(t.get())).toEqual(['fastflowlm'])
  expect(t.write).toHaveBeenCalled()
})
it('passes the query and refresh flag for GGUF/MLX too', async () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, libraryQuery: 'qwen' }))
  await t.action('filter-format:mlx')
  expect(t.execute).toHaveBeenLastCalledWith('models.catalog', {
    category: 'text',
    query: 'qwen',
    refresh: false,
  })
  await t.action('library-refresh')
  expect(t.execute).toHaveBeenLastCalledWith('models.catalog', {
    category: 'text',
    query: 'qwen',
    refresh: true,
  })
})
it('ignores old results and keeps busy until the latest request finishes', async () => {
  const t = fixture(),
    old = deferred(),
    latest = deferred()
  t.execute.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  const a = t.action('filter-format:mlx')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalledTimes(1))
  const b = t.action('filter-format:fastflowlm')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalledTimes(2))
  old.resolve({ rows })
  await a
  expect(t.get().busy).toBe(true)
  expect(t.get().libraryRows).toEqual([])
  latest.resolve({ models: [{ model_id: 'qwen', name: 'Qwen' }] })
  await b
  expect(shown(t.get())).toEqual(['qwen'])
  expect(t.get().busy).toBe(false)
})
it('does not restore an old engine filter after a newer format selection', async () => {
  const t = fixture(),
    old = deferred()
  t.execute.mockReturnValueOnce(old.promise)
  const a = t.action('filter-engine:mlx')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalledTimes(1))
  await t.action('filter-format:fastflowlm')
  old.resolve({ rows })
  await a
  expect(t.get().catalogFilters.engine).toBe('')
  expect(shown(t.get())).toEqual(['fastflowlm'])
})
it('shows a current error without leaving old-format rows, and ignores stale errors', async () => {
  const t = fixture(),
    old = deferred()
  t.execute.mockReturnValueOnce(old.promise)
  const a = t.action('filter-format:mlx')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalledTimes(1))
  await t.action('filter-format:fastflowlm')
  old.reject(new Error('stale failure'))
  await a
  expect(t.get().message).toBe('')
  t.execute.mockRejectedValueOnce(new Error('catalog offline'))
  await t.action('filter-format:mlx')
  expect(t.get()).toMatchObject({ busy: false, message: 'catalog offline', libraryRows: [] })
})
it('keeps media categories separate and restores the text choice on return', async () => {
  const t = fixture()
  await t.action('filter-format:fastflowlm')
  t.execute.mockResolvedValueOnce({ rows: [{ ...rows[0]!, id: 'audio', category: 'audio' }, ...rows] })
  await t.action('category:audio')
  expect(shown(t.get())).toEqual(['audio'])
  await t.action('category:text')
  expect(t.get().libraryFormat).toBe('fastflowlm')
  expect(shown(t.get())).toEqual(['fastflowlm'])
})

it('does not apply hidden text filters or text engine selection to media', () => {
  const t = fixture()
  t.ctx.update((s) => ({
    ...s,
    libraryCategory: 'audio',
    catalogFilters: {
      ...s.catalogFilters,
      engine: 'fastflowlm',
      liked: true,
      downloaded: true,
      uncensored: true,
    },
    libraryRows: [{ id: 'audio', name: 'Audio', category: 'audio', description: '' }],
  }))
  expect(shown(t.get())).toEqual(['audio'])
  t.ctx.update((s) => ({
    ...s,
    workspace: {
      services: [{ provider: 'audio-cpp', model: 'audio', kind: 'audio', state: 'ready' }],
    } as never,
  }))
  expect(catalogDeviceStatus(t.get(), t.get().libraryRows[0]!)).toBe('Loaded')
})
it('reads all managed engines when no engine is selected, including after clearing filters', async () => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, libraryEngines: ['vllm', 'sglang'] }))
  t.execute.mockImplementation(
    async (_name, input) => ({ models: [{ repository: input.engine }, { repository: 'shared' }] }) as never
  )
  await t.action('filter-engine:vllm')
  expect(shown(t.get())).toEqual(['vllm', 'shared'])
  await t.action('filter-engine:')
  expect(shown(t.get())).toEqual(['vllm', 'shared', 'sglang'])
  expect(t.get().libraryRows.find((row) => row.id === 'shared')?.source?.providers).toEqual([
    'vllm',
    'sglang',
  ])
  await t.action('filter-engine:sglang')
  expect(shown(t.get())).toEqual(['sglang', 'shared'])
  await t.action('filter-clear')
  expect(shown(t.get())).toEqual(['vllm', 'shared', 'sglang'])
})

it.each(['catalog', 'downloads'])('keeps %s selected when initial installed models arrive', async (view) => {
  const t = fixture(),
    installed = deferred()
  t.ctx.controller.installed = () => installed.promise
  t.ctx.controller.runtime.snapshot = async () => null as never
  const opening = t.action('page:models')
  await vi.waitFor(() => expect(t.get().page).toBe('models'))
  await t.action(`library:${view}`)
  installed.resolve([{ id: 'local', name: 'Local', provider: 'llamacpp-upstream' }])
  await opening
  expect(t.get().libraryView).toBe(view)
  if (view === 'catalog') expect(shown(t.get())).toContain('local')
})
it('ignores an old row-detail error and completion during a new catalog read', async () => {
  const t = fixture(),
    detail = deferred(),
    catalog = deferred()
  t.ctx.controller.files = () => detail.promise
  const opening = t.action('catalog-row:0')
  await vi.waitFor(() => expect(t.get().catalogOpen).toBe('gguf'))
  t.execute.mockReturnValueOnce(catalog.promise)
  const switching = t.action('filter-format:fastflowlm')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalled())
  detail.reject(new Error('old detail failed'))
  await opening
  expect(t.get()).toMatchObject({ busy: true, message: '' })
  catalog.resolve({ models: [{ model_id: 'qwen', name: 'Qwen' }] })
  await switching
  expect(shown(t.get())).toEqual(['qwen'])
})
it('does not publish an old prepared-engine catalog after switching formats', async () => {
  const t = fixture(),
    prepared = deferred()
  t.ctx.update((s) => ({
    ...s,
    libraryFormat: 'fastflowlm',
    libraryRows: [
      {
        id: 'qwen',
        name: 'Qwen',
        category: 'text',
        description: '',
        source: {
          format: 'fastflowlm',
          variants: [{ id: 'qwen-npu', verdict: { verdict: 'accelerator-not-prepared' } }],
        },
      },
    ],
  }))
  t.execute.mockReturnValueOnce(prepared.promise)
  const preparing = t.action('catalog-download:0')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalledWith('fastflowlm.prepare', {}))
  await t.action('filter-format:gguf')
  prepared.resolve({})
  await preparing
  expect(shown(t.get())).toEqual(['gguf'])
  expect(t.execute).not.toHaveBeenCalledWith('models.search', expect.anything())
})
it('trusts server variant search while filtering only injected local rows by query', async () => {
  const t = fixture()
  t.ctx.update((s) => ({
    ...s,
    libraryQuery: 'qwen3.6-moe-35b-a3b-npu2',
    installed: [{ id: 'unrelated', name: 'Other', provider: 'fastflowlm' }],
  }))
  await t.action('filter-format:fastflowlm')
  expect(shown(t.get())).toEqual(['fastflowlm'])
})
it('does not let an old Engines tab read clear the new catalog loading state', async () => {
  const t = fixture(),
    old = deferred(),
    latest = deferred()
  t.execute.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
  const engines = t.action('library:engines')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalledTimes(1))
  const catalog = t.action('library:catalog')
  await vi.waitFor(() => expect(t.execute).toHaveBeenCalledTimes(2))
  old.resolve({ engines: [] })
  await engines
  expect(t.get().busy).toBe(true)
  latest.resolve({ rows })
  await catalog
  expect(shown(t.get())).toEqual(['gguf'])
})
