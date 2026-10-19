import { expect, it } from 'vitest'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { newSetup } from '../../../terminal-setup/index.js'
import type { BackendCatalogResponse, SetupView } from '../../../terminal-setup/index.js'
const catalogs = ['llamacpp-upstream', 'llamacpp', 'atomic-prism'].map((provider) => ({
  provider,
  available: [{ version: 'v1', backend: 'metal' }],
  recommended: 'v1/metal',
})) as BackendCatalogResponse[]
it.each([
  [54, 24],
  [80, 24],
  [120, 36],
  [180, 56],
])('fits setup and exposes every engine at %ix%i', (w, h) => {
  const s = createWorkspace('setup')
  s.setup = { ...newSetup('server'), catalogs, engine: 'llamacpp-upstream|v1|metal' }
  const frame = workspaceFrame(s, w, h, 0)
  expect(frame.targets.filter((t) => t.id.startsWith('setup-engine:'))).toHaveLength(3)
  for (const t of frame.targets) {
    expect(t.x + t.width).toBeLessThanOrEqual(w)
    expect(t.y + t.height).toBeLessThanOrEqual(t.y === h - 1 ? h : h - 3)
  }
})
it.each([
  ['engine', '01 Engine'],
  ['models', '02 Models'],
  ['download', '03 Install'],
  ['ready', '04 Ready'],
])('marks only the current step bold in %s', (stage, label) => {
  const s = createWorkspace('setup')
  s.setup = { ...newSetup('server'), stage: stage as SetupView['stage'] }
  const frame = workspaceFrame(s, 80, 24, 0)
  const bold = frame.cells
    .find((row) =>
      row
        .map((c) => c.char)
        .join('')
        .includes('01 Engine')
    )!
    .filter((c) => c.bold)
    .map((c) => c.char)
    .join('')
  expect(bold).toBe(label)
})
it('presents the curated model list before the secondary Search button', () => {
  const s = createWorkspace('setup')
  s.setup = {
    ...newSetup('server'),
    stage: 'models',
    repositories: [{ id: 'AtomicChat/Qwen', downloads: 0 }],
  }
  const f = workspaceFrame(s, 80, 24, 0)
  expect(f.targets.find((t) => t.id === 'setup-repo:0')!.y).toBeLessThan(
    f.targets.find((t) => t.id === 'setup-query')!.y
  )
  expect(
    f.cells
      .flat()
      .map((c) => c.char)
      .join('')
  ).toContain('Staff picks')
})

it('gives the default engine no persistent accent when another control has focus', () => {
  const s = createWorkspace('setup')
  s.setup = { ...newSetup('server'), catalogs, engine: 'llamacpp-upstream|v1|metal' }
  s.focus = 'setup-refresh'
  const f = workspaceFrame(s, 80, 24, 0)
  const styles = f.targets
    .filter((t) => t.id.startsWith('setup-engine:'))
    .map((t) => {
      const cell = f.cells[t.y]![t.x]!
      return [cell.color, cell.background]
    })
  expect(styles[0]).toEqual(styles[1])
  expect(styles[1]).toEqual(styles[2])
})
