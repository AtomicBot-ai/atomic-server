import { expect, it, vi } from 'vitest'
import { createWorkspace } from './state.js'
import { workspaceFrame } from './frame.js'
import { workspaceInput } from './input.js'
import { drawIntroEngines } from './intro-engines.js'
import { COLORS, hit } from './draw/canvas.js'
import { sampleDownloads } from './download-rates.js'
import { catalogFilterAction, catalogIndexes } from './library/catalog-filters.js'
import { mediaSetupAction } from './setup/media-step.js'
import type { ActionContext } from './actions.js'
import type { WorkspaceController } from './controller.js'
const job = {
  id: 'model-download',
  stage: 'downloading',
  plan: { model_id: 'Qwen 4B', total_download_bytes: 1000 },
}
const snapshot = (transferred: number) =>
  ({ setups: [job], downloads: [{ taskId: job.id, transferred, total: 1000 }] }) as never
const shown = (frame: ReturnType<typeof workspaceFrame>) =>
  frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')

it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [160, 50],
])('keeps onboarding cards, download status and one Escape action inside %ix%i', (width, height) => {
  const s = createWorkspace('welcome')
  s.workspace = snapshot(500)
  s.transferSamples[job.id] = { bytes: 500, speed: 100, at: 1000 }
  for (const step of ['cloud', 'media', 'connect'] as const) {
    s.firstRun = step
    s.libraryRows = [{ id: 'flux', name: 'Flux', category: 'image', description: 'Image generation' }]
    if (step === 'connect') {
      const before = workspaceFrame(s, width!, height!, 0)
      expect(shown(before)).toContain('Qwen 4B')
      expect(shown(before)).toContain('~5 sec')
      s.overlay = 'connection-guide'
      s.connection = { step: 'choose', path: 'agent', agent: 'codex' } as never
    }
    const frame = workspaceFrame(s, width!, height!, 0)
    const output = shown(frame)
    if (step !== 'connect') expect(output).toContain('(o)(o)')
    if (step !== 'connect') {
      expect(output).toContain('Qwen 4B')
      expect(output).toContain('~5 sec')
      const download = frame.targets.find((t) => t.id === 'download-status')!
      expect(download.y).toBe(width! < 80 ? 6 : 1)
      expect(download.x + download.width).toBe(width! - 2)
      expect(frame.targets.find((t) => t.id === 'first-next')!.y).toBeGreaterThan(
        download.y + download.height
      )
      expect(frame.targets.some((t) => t.id === 'first-skip')).toBe(true)
    } else expect(frame.targets.some((t) => t.id === 'download-status')).toBe(true)
    expect(output.match(/Esc /g)).toHaveLength(1)
    for (const target of frame.targets) {
      expect(target.x + target.width, target.id).toBeLessThanOrEqual(width!)
      expect(target.y + target.height, target.id).toBeLessThanOrEqual(height!)
      expect(hit(frame, target.x, target.y)?.id, target.id).toBe(target.id)
    }
  }
})
it('scrolls to all provider cards with keyboard and mouse, without opening configuration', () => {
  let s = { ...createWorkspace('welcome'), firstRun: 'cloud' as const, focus: 'cloud-choice:0' }
  for (let i = 0; i < 13; i++) {
    const result = workspaceInput('\u001b[<65;20;10M', {} as never, s, workspaceFrame(s, 54, 24, 0))
    expect(result.action).toBeUndefined()
    s = { ...s, ...result.patch } as typeof s
  }
  const f = workspaceFrame(s, 54, 24, 0)
  expect(shown(f)).toContain('Custom provider')
  expect(s.selected).toBe(13)
  const item = f.targets.find((t) => t.id === 'cloud-choice:13')!
  expect(workspaceInput(`\u001b[<0;${item.x + 2};${item.y + 2}M`, {} as never, s, f).action).toBe(item.id)
})
it.each(['cloud', 'media'] as const)(
  'shows keyboard focus on background download controls during %s setup',
  (step) => {
    let s = createWorkspace('welcome')
    s.firstRun = step
    s.workspace = snapshot(500)
    s.focus = 'download-status'
    for (const id of ['download-pause:setup:model-download', 'download-remove:setup:model-download']) {
      const input = workspaceInput('', { tab: true } as never, s, workspaceFrame(s, 54, 24, 0))
      s = { ...s, ...input.patch }
      expect(s.focus).toBe(id)
      const frame = workspaceFrame(s, 54, 24, 0)
      const target = frame.targets.find((t) => t.id === id)!
      expect(frame.cells[target.y]![target.x]!.background).toBe(COLORS.gold)
    }
  }
)
it('renders the engine chooser as ASCII with whole-card click targets', () => {
  const choices = ['llamacpp-upstream', 'llamacpp', 'atomic-prism'].map((provider) => ({
    id: provider,
    provider,
    version: 'b1',
    backend: 'cpu',
    installed: false,
  }))
  const frame = drawIntroEngines(54, 24, choices, 1, '', 0)
  expect(shown(frame)).toMatch(/^[\x20-\x7E\n]*$/)
  const target = frame.targets.find((t) => t.id === 'engine:1')!
  expect(hit(frame, target.x + target.width - 2, target.y + 1)?.id).toBe('engine:1')
  expect(shown(frame)).not.toContain('Press any key')
})
it('estimates transfer speed from progress and discards stale or reset samples', () => {
  const first = sampleDownloads({}, snapshot(100), 1000)
  expect(first[job.id]?.speed).toBe(0)
  expect(sampleDownloads(first, snapshot(500), 3000)[job.id]?.speed).toBe(200)
  expect(sampleDownloads(first, snapshot(0), 3000)[job.id]?.speed).toBe(0)
  expect(sampleDownloads(first, { setups: [], downloads: [] } as never, 4000)).toEqual({})
})
it('filters and sorts by stable model identity and persists liked models', async () => {
  let s = createWorkspace('models')
  s.libraryRows = [
    { id: 'a', name: 'Alpha', category: 'text', description: '', source: { downloads: 10 } },
    { id: 'b', name: 'Beta Uncensored', category: 'text', description: '', source: { downloads: 50 } },
    { id: 'c', name: 'MLX', category: 'text', description: '', source: { format: 'mlx' } },
  ]
  s.catalogFilters.sort = 'downloads'
  expect(catalogIndexes(s)).toEqual([1, 0])
  const saveCatalogLikes = vi.fn(async () => {})
  const ctx = {
    get: () => s,
    update: (fn: (v: typeof s) => typeof s) => {
      s = fn(s)
    },
    controller: { saveCatalogLikes, runtime: { execute: async () => ({ rows: s.libraryRows }) } },
  } as unknown as ActionContext
  await catalogFilterAction('library-like', ctx)
  expect(saveCatalogLikes).toHaveBeenCalledWith(['b'])
  await catalogFilterAction('filter-liked', ctx)
  expect(catalogIndexes(s)).toEqual([1])
  await catalogFilterAction('filter-engine:atomic-prism', ctx)
  expect(catalogIndexes(s)).toEqual([])
  await catalogFilterAction('filter-clear', ctx)
  expect(catalogIndexes(s)).toEqual([1, 0])
})
it('starts an optional media download once and stays in onboarding', async () => {
  let s = { ...createWorkspace('welcome'), firstRun: 'media' as const }
  s.libraryRows = [{ id: 'flux', name: 'Flux', category: 'image', description: '' }]
  const execute = vi.fn(async (name: string) =>
    name === 'artifacts.plan' ? { digest: 'd1', blockers: [], model_id: 'flux' } : {}
  )
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s) as typeof s
    },
    controller: {
      runtime: {
        execute,
        snapshot: async () => ({
          setups: [{ id: 'f1', stage: 'downloading', plan: { model_id: 'flux' } }],
          downloads: [],
        }),
      },
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  await mediaSetupAction('media-row:0', ctx)
  expect(s).toMatchObject({ page: 'welcome', firstRun: 'media', overlay: null })
  await mediaSetupAction('media-row:0', ctx)
  expect(execute.mock.calls.filter(([name]) => name === 'artifacts.install')).toHaveLength(1)
})
