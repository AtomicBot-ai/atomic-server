import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { hit } from '../draw/canvas.js'
import { catalogIndexes } from './catalog-filters.js'
import { modelInstalled, modelJob } from './model-job.js'

const rows = [
  { id: 'fixture/one', name: 'One', category: 'text', description: 'Small model', source: { downloads: 10 } },
  {
    id: 'fixture/two',
    name: 'Two',
    category: 'text',
    description: 'Large model',
    source: { downloads: 100 },
  },
]
function fixture(over: Partial<WorkspaceState> = {}) {
  let s = {
    ...createWorkspace('models'),
    setupComplete: true,
    libraryView: 'catalog' as const,
    libraryRows: rows,
    ...over,
  }
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    if (name === 'models.catalog') return { rows }
    if (name === 'models.plan') return { digest: 'text-plan', blockers: [], model_id: 'downloaded-one' }
    if (name === 'artifacts.plan') return { digest: 'media-plan', blockers: [], model_id: 'flux:fp8' }
    if (name === 'artifacts.install')
      s = {
        ...s,
        workspace: {
          setups: [
            {
              id: 'media',
              kind: 'artifact',
              stage: 'downloading',
              plan: { category: 'image', model_id: 'flux:fp8' },
            },
          ],
          downloads: [],
          api: { port: 1337 },
        } as never,
      }
    if (name === 'downloads.remove')
      s = { ...s, workspace: { setups: [], downloads: [], api: { port: 1337 } } as never }
    if (name === 'cloud.list') return { providers: [{ provider: 'openai', connected: true }] }
    return input
  })
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: {
      files: async () => [
        { filename: 'one.Q4.gguf', size: 1024 },
        { filename: 'one.Q8.gguf', size: 2048 },
      ],
      installed: async () => s.installed,
      saveCatalogLikes: vi.fn(),
      setup: { engines: async () => ['llamacpp-upstream', 'mlx'] },
      runtime: { execute, snapshot: async () => s.workspace },
    } as unknown as WorkspaceController,
  }
  return { ctx, execute, get: () => s, action: (id: string) => activate(id, ctx) }
}
const text = (s: WorkspaceState, w = 120, h = 36) =>
  workspaceFrame(s, w, h, 0)
    .cells.map((r) => r.map((c) => c.char).join(''))
    .join('\n')

it('opens a family, selects a specific version, downloads it once, and keeps the catalog context', async () => {
  const t = fixture()
  await t.action('catalog-row:0')
  expect(t.execute).not.toHaveBeenCalledWith('models.install', expect.anything())
  expect(t.get().catalogOpen).toBe('fixture/one')
  await t.action('catalog-variants')
  expect(text(t.get())).toContain('one.Q8.gguf')
  const key = workspaceInput('', { downArrow: true } as never, t.get(), workspaceFrame(t.get(), 120, 36, 0))
  t.ctx.update((s) => ({ ...s, ...key.patch }))
  expect(t.get().focus).toBe('catalog-variant:1')
  await t.action(t.get().focus)
  await t.action('catalog-download:0')
  expect(t.execute).toHaveBeenCalledWith('models.plan', {
    repo: 'fixture/one',
    file: 'one.Q8.gguf',
    include_projector: true,
  })
  expect(t.execute.mock.calls.filter(([name]) => name === 'models.install')).toHaveLength(1)
  expect(t.get()).toMatchObject({ libraryView: 'catalog', overlay: null, catalogOpen: 'fixture/one' })
})
it('keeps sort separate, clears filters without resetting sort or format, and imports a local file', async () => {
  const t = fixture()
  await t.action('catalog-sort')
  expect(text(t.get())).toContain('Most downloaded')
  await t.action('catalog-sort:downloads')
  expect(catalogIndexes(t.get())).toEqual([1, 0])
  t.ctx.update((s) => ({
    ...s,
    libraryFormat: 'mlx',
    catalogFilters: { ...s.catalogFilters, engine: 'mlx', liked: true },
  }))
  await t.action('filter-clear')
  expect(t.get()).toMatchObject({
    libraryFormat: 'mlx',
    catalogFilters: { sort: 'downloads', engine: '', liked: false },
  })
  await t.action('catalog-import')
  t.ctx.update((s) => ({ ...s, editValue: '/tmp/user-chosen.gguf' }))
  await t.action('save-edit')
  expect(t.execute).toHaveBeenCalledWith('models.import', { path: '/tmp/user-chosen.gguf' })
})
it('selects an engine and its format, while selecting only a format clears the engine', async () => {
  const t = fixture({ libraryEngines: ['llamacpp-upstream', 'mlx'] })
  await t.action('filter-engine:mlx')
  expect(t.get()).toMatchObject({ libraryFormat: 'mlx', catalogFilters: { engine: 'mlx' } })
  await t.action('filter-format:gguf')
  expect(t.get()).toMatchObject({ libraryFormat: 'gguf', catalogFilters: { engine: '' } })
  await t.action('catalog-category')
  expect(text(t.get())).toContain('Embeddings')
  await t.action('category:video')
  expect(t.get()).toMatchObject({ libraryCategory: 'video', overlay: null })
})
it('walks cloud, optional media queue and connection choice without repeated setup screens', async () => {
  const t = fixture({ page: 'welcome', setupComplete: false, firstRun: 'cloud' })
  await t.action('cloud-choice:0')
  expect(text(t.get())).toContain('API key')
  expect(text(t.get())).not.toContain('Model IDs:')
  await t.action('cloud-options')
  expect(text(t.get())).toContain('Discover automatically')
  await t.action('cloud-key')
  t.ctx.update((s) => ({ ...s, cloud: { ...s.cloud, key: 'fixture-key' } }))
  await t.action('cloud-save')
  expect(t.execute).toHaveBeenCalledWith(
    'cloud.connect',
    expect.objectContaining({ models: [], api_key: 'fixture-key' })
  )
  expect(text(t.get())).toContain('[Connected]')
  await t.action('first-next')
  t.ctx.update((s) => ({
    ...s,
    libraryRows: [{ id: 'flux', name: 'Flux', category: 'image', description: 'Image model' }],
  }))
  await t.action('media-row:0')
  expect(t.get()).toMatchObject({ page: 'welcome', firstRun: 'media', overlay: null })
  expect(modelJob(t.get(), 'flux')?.['id']).toBe('media')
  await t.action('media-row:0')
  expect(t.get().overlay).toBe('download-remove')
  expect(t.execute.mock.calls.filter(([name]) => name === 'downloads.remove')).toHaveLength(0)
  await t.action('download-remove-confirm')
  expect(t.execute).toHaveBeenCalledWith('downloads.remove', { id: 'media', owner: 'artifacts' })
  await t.action('first-next')
  expect(t.get()).toMatchObject({ firstRun: 'connect', overlay: null, connection: null })
  await t.action('first-connect:agent')
  expect(t.get()).toMatchObject({ firstRun: null, setupComplete: true, page: 'server' })
})
it('treats a quantized ready family as installed and keeps installed media first', () => {
  const t = fixture({
    libraryCategory: 'image',
    workspace: {
      setups: [{ id: 'done', stage: 'ready', plan: { model_id: 'fixture/two:fp8', category: 'image' } }],
      downloads: [],
      api: { port: 1337 },
    } as never,
  })
  expect(modelInstalled(t.get(), 'fixture/two')).toBe(true)
  expect(catalogIndexes(t.get())).toEqual([1, 0])
})
it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [160, 50],
])('keeps catalog menus and download actions usable at %ix%i', async (w, h) => {
  const t = fixture()
  await t.action('catalog-row:0')
  const frame = workspaceFrame(t.get(), w, h, 0)
  expect(frame.targets.some((t) => t.id === 'catalog-download:0')).toBe(true)
  for (const target of frame.targets) {
    expect(target.x + target.width, target.id).toBeLessThanOrEqual(w)
    expect(target.y + target.height, target.id).toBeLessThanOrEqual(h)
    expect(hit(frame, target.x, target.y)?.id, target.id).toBe(target.id)
  }
})

it('keeps newer transfers ahead of failed attempts and exposes inline pause/removal', async () => {
  const t = fixture({
    workspace: {
      setups: [
        { id: 'old', stage: 'failed', plan: { model_id: 'fixture/one:old' } },
        { id: 'ready', stage: 'ready', plan: { model_id: 'fixture/one:ready', category: 'image' } },
        {
          id: 'active',
          kind: 'artifact',
          stage: 'downloading',
          plan: { category: 'image', model_id: 'fixture/one:new' },
        },
      ],
      downloads: [],
      api: { port: 1337, running: false },
    } as never,
  })
  expect(modelJob(t.get(), 'fixture/one')?.['id']).toBe('active')
  expect(modelInstalled(t.get(), 'fixture/one')).toBe(true)
  await t.action('catalog-row:0')
  for (const [w, h] of [
    [54, 24],
    [80, 24],
    [120, 36],
  ]) {
    const frame = workspaceFrame(t.get(), w!, h!, 0)
    for (const id of ['download-pause:artifacts:active', 'download-remove:artifacts:active']) {
      const target = frame.targets.find((item) => item.id === id)!
      expect(target, `${id} at ${w}×${h}`).toBeDefined()
      expect(hit(frame, target.x, target.y)?.id).toBe(id)
    }
  }
})

it('opens Custom Endpoint directly and returns to its list on Back', async () => {
  const t = fixture()
  await t.action('library:endpoint')
  expect(t.get()).toMatchObject({
    libraryView: 'endpoint',
    overlay: 'cloud',
    cloud: { editing: true, provider: '', optionsOpen: true },
  })
  expect(text(t.get())).toContain('Provider: Custom provider')
  await t.action('cloud-close')
  expect(t.get()).toMatchObject({ libraryView: 'endpoint', overlay: null })
})

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
])('renders media families and their inline version controls at %ix%i', async (w, h) => {
  const t = fixture({
    libraryCategory: 'image',
    libraryRows: [
      {
        id: 'flux',
        name: 'Flux',
        description: 'Image generation',
        category: 'image',
        source: { developer: 'Example', transformer: { quants: [{ id: 'fp8' }, { id: 'fp16' }] } },
      },
    ],
  })
  await t.action('catalog-row:0')
  expect(text(t.get(), w, h)).toContain('Available')
  expect(text(t.get(), w, h)).toContain('Example')
  const frame = workspaceFrame(t.get(), w, h, 0)
  expect(frame.targets.some((target) => target.id === 'catalog-variants')).toBe(true)
  expect(frame.targets.some((target) => target.id === 'catalog-download:0')).toBe(true)
  expect(frame.targets.every((target) => target.x + target.width <= w && target.y + target.height <= h)).toBe(
    true
  )
})
