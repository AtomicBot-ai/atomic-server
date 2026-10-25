import { expect, it } from 'vitest'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { catalogDeviceStatus } from './model-job.js'
import { installedModelRows } from './installed-model-rows.js'

function fixture() {
  const s = createWorkspace('models')
  s.setupComplete = true
  s.installed = [{ id: 'file-q4', name: 'Local model', provider: 'llamacpp-upstream' }]
  s.models = ['file-q4', 'cloud-only']
  s.libraryRows = [{ id: 'owner/family', name: 'Family', category: 'text', description: '' }]
  s.workspace = {
    services: [
      {
        id: 'session',
        model: 'file-q4',
        provider: 'llamacpp-upstream',
        kind: 'chat',
        state: 'ready',
        details: {},
      },
    ],
    loads: [],
    downloads: [],
    setups: [{ id: 'job', stage: 'ready', request: { repo: 'owner/family' }, plan: { model_id: 'file-q4' } }],
  } as never
  return s
}
const text = (s: ReturnType<typeof fixture>, width: number) =>
  workspaceFrame(s, width, 36, 0)
    .cells.map((row) => row.map((cell) => cell.char).join(''))
    .join('\n')

it.each([54, 120, 180])(
  'shows actual local status in the catalog and installed list at %i columns',
  (width) => {
    const s = fixture()
    expect(catalogDeviceStatus(s, s.libraryRows[0]!)).toBe('Loaded')
    expect(text(s, width)).toContain('Loaded')
    s.workspace!.services = []
    expect(text(s, width)).toContain('Downloaded')
    s.workspace!.loads = [
      {
        model_id: 'file-q4',
        provider: 'llamacpp-upstream',
        stage: 'initializing-engine',
        generation: 'g',
        elapsed_ms: 0,
        at: 0,
      },
    ]
    expect(text(s, width)).toContain('Loading…')
    s.libraryView = 'installed'
    expect(text(s, width)).toContain('[Loading…]')
    expect(text(s, width)).not.toContain('cloud-only')
    expect(installedModelRows(s)).toHaveLength(1)
  }
)
it('keeps media kind/provider separate and moves focus across local and media files', () => {
  const s = fixture()
  s.workspace!.setups.push({
    id: 'image',
    stage: 'ready',
    plan: {
      category: 'image',
      engine: 'sd-cpp',
      model_id: 'flux:q4',
      name: 'Flux',
    },
  })
  s.workspace!.services.push({
    id: 'media',
    model: 'flux:q4',
    provider: 'sd-cpp',
    kind: 'image-video',
    state: 'ready',
    details: {},
  })
  s.libraryCategory = 'image'
  s.libraryRows = [{ id: 'flux', name: 'Flux', category: 'image', description: '' }]
  expect(text(s, 54)).toContain('Loaded')
  s.libraryView = 'installed'
  s.focus = 'installed:0'
  const result = workspaceInput('', { downArrow: true } as never, s, workspaceFrame(s, 54, 24, 0))
  expect(result.patch).toMatchObject({ focus: 'media-installed:image', selected: 1 })
  s.workspace!.services[1]!.kind = 'chat'
  expect(installedModelRows(s)[1]!.status).toBe('Downloaded')
})
