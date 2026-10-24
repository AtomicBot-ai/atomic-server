import { expect, it } from 'vitest'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { cloudListLayout } from './cloud-layout.js'
import { hit, COLORS } from '../draw/canvas.js'

const pending = {
  setups: [
    { id: 'download', stage: 'downloading', plan: { model_id: 'Qwen 4B', total_download_bytes: 1000 } },
  ],
  downloads: [{ taskId: 'download', transferred: 500, total: 1000 }],
} as never

it.each([
  [54, 24, 2],
  [120, 36, 4],
])('keeps providers, download controls and navigation visible at %s×%s', (width, height, columns) => {
  const s = {
    ...createWorkspace('welcome'),
    firstRun: 'cloud' as const,
    workspace: pending,
    focus: 'cloud-choice:0',
  }
  const frame = workspaceFrame(s, width!, height!, 0)
  const providers = frame.targets.filter((t) => t.id.startsWith('cloud-choice:'))
  expect(providers.filter((t) => t.y === providers[0]!.y)).toHaveLength(columns!)
  expect(providers.length).toBeGreaterThanOrEqual(columns!)
  const next = frame.targets.find((t) => t.id === 'first-next')!
  const strip = frame.targets.find((t) => t.id === 'download-status')!
  expect(strip.y).toBe(width! < 80 ? 6 : 1)
  expect(strip.x + strip.width).toBe(width! - 2)
  expect(next.y).toBeGreaterThan(strip.y + strip.height)
  for (const provider of providers) {
    expect(provider.y).toBeGreaterThanOrEqual(strip.y + strip.height + 1)
    expect(provider.y + provider.height).toBeLessThan(next.y)
    expect(hit(frame, provider.x + 1, provider.y + Math.min(1, provider.height - 1))?.id).toBe(provider.id)
  }
  expect(frame.targets.some((t) => t.id === 'download-pause:setup:download')).toBe(true)
  expect(frame.targets.some((t) => t.id === 'download-remove:setup:download')).toBe(true)
})

it.each([
  [54, 24, 2],
  [120, 36, 4],
])(
  'moves through provider rows spatially and scrolls the focused card at %s×%s',
  (width, height, columns) => {
    let s = {
      ...createWorkspace('welcome'),
      firstRun: 'cloud' as const,
      workspace: pending,
      focus: 'cloud-choice:0',
    }
    const key = (key: Record<string, boolean>) => {
      const result = workspaceInput('', key as never, s, workspaceFrame(s, width!, height!, 0))
      s = { ...s, ...result.patch } as typeof s
    }
    key({ downArrow: true })
    expect(s.focus).toBe(`cloud-choice:${columns}`)
    key({ rightArrow: true })
    expect(s.focus).toBe(`cloud-choice:${columns! + 1}`)
    key({ upArrow: true })
    expect(s.focus).toBe('cloud-choice:1')
    key({ pageDown: true })
    expect(workspaceFrame(s, width!, height!, 0).targets.some((t) => t.id === s.focus)).toBe(true)
  }
)

it('scrolls the cloud library from keyboard focus rather than a stale list index', () => {
  const s = {
    ...createWorkspace('models'),
    libraryView: 'cloud' as const,
    focus: 'cloud-choice:10',
    selected: 0,
  }
  const result = workspaceInput('\u001b[<65;45;10M', {} as never, s, workspaceFrame(s, 120, 36, 0))
  expect(result.patch).toMatchObject({ focus: 'cloud-choice:11', selected: 11 })
})

it('uses a muted connected badge without removing the provider card', () => {
  const s = { ...createWorkspace('welcome'), firstRun: 'cloud' as const }
  s.cloud.providers = [{ provider: 'openai', connected: true }] as never
  const frame = workspaceFrame(s, 54, 24, 0)
  const target = frame.targets.find((t) => t.id === 'cloud-choice:0')!
  expect(frame.cells[target.y + 1]![target.x + 2]!.color).toBe(COLORS.stone)
  expect(frame.cells[target.y]!.map((c) => c.char).join('')).toContain('[Connected]')
})

it('uses one column only where two readable cards cannot fit', () => {
  expect(cloudListLayout(30, 9)).toMatchObject({ columns: 1, rows: 3 })
  expect(cloudListLayout(66, 9)).toMatchObject({ columns: 3, rows: 3 })
})

it('scrolls both optional media choices while a download continues on a compact terminal', () => {
  const s = { ...createWorkspace('welcome'), firstRun: 'media' as const, workspace: pending }
  s.libraryRows = [
    { id: 'image', name: 'Image model', category: 'image', description: '' },
    { id: 'video', name: 'Video model', category: 'video', description: '' },
  ]
  s.setupMedia = { ...s.setupMedia, image: 'image', video: 'video' }
  for (const id of ['media-queue:0', 'media-queue:1']) {
    s.focus = id
    const frame = workspaceFrame(s, 54, 24, 0)
    const control = frame.targets.find((t) => t.id === id)!
    expect(control).toBeDefined()
    expect(hit(frame, control.x, control.y)?.id).toBe(id)
    expect(control.y).toBeLessThan(frame.targets.find((t) => t.id === 'first-next')!.y)
  }
})
