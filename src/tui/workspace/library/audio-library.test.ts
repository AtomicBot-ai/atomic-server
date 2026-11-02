import { expect, it, vi } from 'vitest'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { goalSetupAction } from '../setup/goal-setup.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { catalogMenuItems } from './catalog-menu.js'
import { engineAction, hasPanel } from './engine-actions.js'
import { enginePanelModel } from './engine-panel-model.js'
import type { EnginePanel } from './engine-panel-model.js'
import { installedModelRows } from './installed-model-rows.js'
import { catalogDeviceStatus } from './model-job.js'

const ATTRIBUTION = 'Powered by Stability AI'
const stable = {
  id: 'stable-audio-3-small-sfx',
  name: 'Stable Audio 3 Small SFX',
  category: 'audio',
  description: 'Short sound effects from a description.',
  source: { attribution: ATTRIBUTION, engines: ['audio-cpp'], developer: 'Stability AI' },
}
const job = {
  id: 'job',
  stage: 'ready',
  plan: {
    category: 'audio',
    engine: 'audio-cpp',
    model_id: 'stable-audio-3-small-sfx:q8_0',
    name: 'Stable Audio 3 Small SFX',
    audio: { attribution: ATTRIBUTION },
  },
}
function audioWorkspace(over: Partial<NonNullable<WorkspaceState['workspace']>> = {}) {
  return { services: [], setups: [], downloads: [], ...over } as never
}
function state(over: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    ...createWorkspace('models'),
    setupComplete: true,
    libraryView: 'catalog',
    libraryCategory: 'audio',
    libraryRows: [stable],
    workspace: audioWorkspace(),
    ...over,
  }
}
const screen = (s: WorkspaceState, width = 100) =>
  workspaceFrame(s, width, 30, 0)
    .cells.map((row) => row.map((cell) => cell.char).join(''))
    .join('\n')

it('offers the audio category before and after a status snapshot', () => {
  const labels = (s: WorkspaceState) =>
    catalogMenuItems({ ...s, catalogMenu: 'category' }).map((item) => item.label)
  expect(labels(state())).toContain('Audio')
  expect(labels(state({ workspace: null }))).toContain('Audio')
})

it('shows the notice of its license on a model it offers', () => {
  expect(screen(state())).toContain(ATTRIBUTION)
})

it('shows the notice on a model it has downloaded, with its status', () => {
  const s = state({ libraryView: 'installed', workspace: audioWorkspace({ setups: [job] }) })
  expect(installedModelRows(s)).toMatchObject([
    { name: `Stable Audio 3 Small SFX · ${ATTRIBUTION}`, status: 'Downloaded' },
  ])
})

it('says a model is loaded when the audio engine serves it', () => {
  const s = state({
    workspace: audioWorkspace({
      setups: [job],
      services: [
        {
          id: 'audio',
          provider: 'audio-cpp',
          model: 'stable-audio-3-small-sfx:q8_0',
          kind: 'audio',
          state: 'loaded',
          details: {},
        },
      ],
    }),
  })
  expect(catalogDeviceStatus(s, stable)).toBe('Loaded')
})

const panel = (over: Partial<EnginePanel> = {}): EnginePanel => ({
  engine: 'audio-cpp',
  kind: 'build',
  summary: 'Not installed',
  mode: 'engine',
  form: null,
  foundry: null,
  state: null,
  busy: false,
  error: '',
  notice: '',
  removing: false,
  keepModels: false,
  launch: 'terminal',
  seen: '',
  ...over,
})

it('shows audio.cpp as an engine of builds, with no settings of its own', () => {
  const model = enginePanelModel(panel({ buildInstalled: false }), null)
  expect(model.lines.map((line) => line.text)).toEqual([
    'audio.cpp',
    'Not installed',
    'Generation settings are sent with each audio task.',
  ])
  expect(model.buttons.map((button) => button.id)).toContain('engine-install')
  expect(hasPanel('audio-cpp')).toBe(true)
})

it('opens its panel without asking the core for settings it does not have', async () => {
  let s: WorkspaceState = { ...state(), libraryView: 'engines' }
  const execute = vi.fn(async () => ({
    engines: [{ engine: 'audio-cpp', builds: [], active: null, active_choice: 'core' }],
  }))
  const ctx = {
    get: () => s,
    update: (fn: (v: WorkspaceState) => WorkspaceState) => {
      s = fn(s)
    },
    controller: { runtime: { execute, start: async () => ({ launch: 'terminal' }) } },
  } as unknown as Pick<ActionContext, 'get' | 'update' | 'controller'>
  await engineAction('engine-open:audio-cpp', ctx)
  expect(s.enginePanel).toMatchObject({ engine: 'audio-cpp', kind: 'build', buildInstalled: false })
  expect(execute.mock.calls.map(([name]: unknown[]) => name)).toEqual(['engines.list'])
})

function goalContext(start: WorkspaceState) {
  let s = start
  const execute = vi.fn(async () => ({}))
  const ctx = {
    get: () => s,
    update: (fn: (v: WorkspaceState) => WorkspaceState) => {
      s = fn(s)
    },
    controller: {
      runtime: { execute, snapshot: async () => start.workspace },
      installed: async () => [],
      models: async () => [],
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  } as ActionContext
  return { ctx, execute, state: () => s }
}

it('opens the audio catalog for the audio goal', async () => {
  const { ctx, state: current } = goalContext(state({ libraryCategory: 'text' }))
  await goalSetupAction('goal:audio', ctx)
  expect(current()).toMatchObject({ setupGoal: 'audio', libraryCategory: 'audio', setupComplete: true })
})
