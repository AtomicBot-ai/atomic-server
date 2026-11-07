import { expect, it, vi } from 'vitest'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { activate } from '../actions.js'
import { canvas, hit, COLORS } from '../draw/canvas.js'
import { drawEnginePanel } from './engine-panel.js'
import { enginePanelModel, type EnginePanel } from './engine-panel-model.js'
import { drawCatalogDownloadRows } from './catalog-download-rows.js'

const panel = (): EnginePanel => ({
  engine: 'foundry-local',
  kind: 'foundry',
  summary: '',
  mode: 'engine',
  form: null,
  state: null,
  foundry: {
    view: { installed: true, build: 'v2.1.0/linux-x64', accelerators: [], preparing: false } as never,
    search: null,
    plan: null,
  },
  busy: false,
  error: '',
  notice: '',
  removing: false,
  keepModels: false,
  launch: 'terminal',
  seen: '',
})
it.each([
  [54, 24],
  [120, 36],
])('keeps compact panel buttons and their painted areas aligned at %sx%s', (w, h) => {
  const s = { ...createWorkspace('models'), enginePanel: panel() }
  const c = canvas(w!, h!)
  drawEnginePanel(c, s, 'engine-refresh')
  const footer = enginePanelModel(s.enginePanel, null).buttons
  for (const b of footer) {
    const t = c.targets.find((t) => t.id === b.id)!
    expect(t, b.id).toBeDefined()
    expect(t.height).toBe(1)
    expect(t.y).toBeLessThan(c.popover!.y + c.popover!.height - 1)
    expect(t.x + t.width).toBeLessThanOrEqual(c.popover!.x + c.popover!.width - 2)
    expect(hit(c, t.x, t.y)?.id).toBe(b.id)
  }
  for (let y = c.popover!.y + 1; y < c.popover!.y + c.popover!.height - 1; y++)
    for (let x = c.popover!.x + 1; x < c.popover!.x + c.popover!.width - 1; x++)
      if (c.cells[y]![x]!.background === COLORS.navButton)
        expect(c.targets.some((t) => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height)).toBe(
          true
        )
})
it('rechecks the catalog on return from an installed engine and preserves the expanded family', async () => {
  const model = (verdict: string) => ({
    model_id: 'qwen',
    name: 'Qwen',
    default_variant: 'qwen-cpu',
    variants: [{ id: 'qwen-cpu', verdict: { verdict } }],
  })
  let s: WorkspaceState = {
    ...createWorkspace('models'),
    setupComplete: true,
    libraryFormat: 'foundry',
    libraryEngines: ['foundry-local'],
    overlay: 'engine-panel',
    enginePanel: panel(),
    catalogOpen: 'qwen',
    catalogVariants: [{ value: 'qwen-cpu', label: 'CPU' }],
    catalogVariant: 'qwen-cpu',
    libraryRows: [
      {
        id: 'qwen',
        name: 'Qwen',
        category: 'text',
        description: '',
        source: { ...model('engine-not-installed'), format: 'foundry', engine: 'foundry-local' },
      },
    ],
  }
  const execute = vi.fn(async () => ({ models: [model('ok')] }))
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  }
  await activate('close', ctx)
  expect(execute).toHaveBeenCalledWith('models.search', { engine: 'foundry-local' })
  expect(s).toMatchObject({ overlay: null, catalogOpen: 'qwen', catalogVariant: 'qwen-cpu' })
  const c = canvas(100, 20)
  drawCatalogDownloadRows(c, s, 0, 0, 0, 90, 5, '')
  const text = c.cells.map((r) => r.map((c) => c.char).join('')).join('\n')
  expect(text).toContain('Download')
  expect(text).not.toContain('Install engine')
})
