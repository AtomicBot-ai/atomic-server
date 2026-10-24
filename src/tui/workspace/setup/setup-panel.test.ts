import { expect, it } from 'vitest'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { workspaceInput } from '../input.js'
import { COLORS, hit } from '../draw/canvas.js'
import { brandHeaderRows } from '../draw/brand-header.js'
import { newSetup } from '../../../terminal-setup/index.js'
import type { BackendCatalogResponse } from '../../../terminal-setup/index.js'
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
it('uses descriptive headings without numbered step counters', () => {
  const s = createWorkspace('setup')
  s.setup = { ...newSetup('server'), stage: 'models' }
  const frame = workspaceFrame(s, 80, 24, 0)
  const text = frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')
  expect(text).toContain('Choose your first model')
  expect(text).not.toContain('01 Engine')
})
it('places search above model cards and version choices on each card', () => {
  const s = createWorkspace('setup')
  s.firstRun = null
  s.setup = {
    ...newSetup('server'),
    stage: 'models',
    repositories: [{ id: 'AtomicChat/Qwen', downloads: 0 }],
  }
  const f = workspaceFrame(s, 80, 24, 0)
  expect(f.targets.find((t) => t.id === 'setup-repo:0')!.y).toBeGreaterThan(
    f.targets.find((t) => t.id === 'setup-query')!.y
  )
  expect(
    f.cells
      .flat()
      .map((c) => c.char)
      .join('')
  ).toContain('Versions v')
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

it('offers the managed engines and Foundry Local the core registers beside llama.cpp, in order', () => {
  const s = createWorkspace('setup')
  s.setup = {
    ...newSetup('server'),
    catalogs: catalogs.slice(0, 1),
    registered: ['llamacpp-upstream', 'vllm', 'tensorrt-llm', 'foundry-local'],
    engine: 'llamacpp-upstream|v1|metal',
  }
  const screen = workspaceFrame(s, 120, 36, 0)
    .cells.map((row) => row.map((c) => c.char).join(''))
    .join('\n')
  const at = (name: string) => screen.indexOf(name)
  for (const name of ['vLLM', 'TensorRT-LLM', 'Foundry Local'])
    expect(at(name)).toBeGreaterThan(at('llama.cpp'))
  expect(at('vLLM')).toBeLessThan(at('TensorRT-LLM'))
  expect(at('TensorRT-LLM')).toBeLessThan(at('Foundry Local'))
  expect(screen).not.toContain('Atomic Prism')
})

it('offers no managed engine where the core registers none (macOS)', () => {
  const s = createWorkspace('setup')
  s.setup = {
    ...newSetup('server'),
    catalogs,
    registered: ['llamacpp-upstream', 'llamacpp', 'atomic-prism', 'mlx'],
  }
  const screen = workspaceFrame(s, 120, 36, 0)
    .cells.map((row) => row.map((c) => c.char).join(''))
    .join('\n')
  for (const name of ['vLLM', 'SGLang', 'TensorRT-LLM']) expect(screen).not.toContain(name)
})

it('shows why the engine check failed instead of calling every engine incompatible', () => {
  const s = createWorkspace('setup')
  s.setup = {
    ...newSetup('server'),
    error:
      'The server did not start.\nerror: The admin could not listen on 127.0.0.1:1338.\n  the port is in use\nHint: see `atc logs`',
  }
  const f = workspaceFrame(s, 80, 24, 0)
  const screen = f.cells.map((row) => row.map((c) => c.char).join('')).join('\n')
  expect(screen).toContain('The server did not start.')
  expect(screen).toContain('the port is in use')
  expect(screen).toContain('Hint: see `atc logs`')
  expect(screen).not.toContain('No compatible build available')
  expect(f.targets.filter((t) => t.id.startsWith('setup-engine:'))).toHaveLength(0)
  expect(f.targets.some((t) => t.id === 'setup-refresh')).toBe(true)
})

it('scrolls all installed model choices during onboarding', () => {
  let s = createWorkspace('setup')
  s.firstRun = 'model'
  s.setup = { ...newSetup('server'), stage: 'models' }
  s.installed = Array.from({ length: 6 }, (_, i) => ({
    id: `local-${i}`,
    name: `Local ${i}`,
    provider: 'llamacpp-upstream',
  }))
  s.focus = 'first-model-choice:0'
  for (let i = 0; i < 5; i++) {
    const result = workspaceInput('', { downArrow: true } as never, s, workspaceFrame(s, 54, 24, 0))
    s = { ...s, ...result.patch }
  }
  expect(s.focus).toBe('first-model-choice:5')
  expect(workspaceFrame(s, 54, 24, 0).targets.some((t) => t.id === s.focus)).toBe(true)
})

it.each([
  [54, 24],
  [120, 36],
])('stops preparation animation and exposes retry/back after failure at %ix%i', (w, h) => {
  const s = createWorkspace('setup')
  s.setup = {
    ...newSetup('server'),
    stage: 'download',
    preparing: true,
    busy: false,
    repository: 'AtomicChat/Unavailable-4B',
    error: 'This model requires an unavailable inference engine. Choose another model.',
  }
  const frame = workspaceFrame(s, w, h, 1)
  const screen = frame.cells.map((row) => row.map((c) => c.char).join('')).join('\n')
  expect(screen).toContain('Model setup stopped')
  expect(screen).toContain('Choose another model.')
  expect(screen).not.toContain('Preparing')
  expect(screen).not.toContain('Checking model')
  expect(screen).not.toContain('Cancel preparation')
  expect(frame.targets.map((t) => t.id)).toEqual(expect.arrayContaining(['setup-retry', 'setup-cancel']))
  const retry = frame.targets.find((t) => t.id === 'setup-retry')!
  expect(retry.height).toBe(3)
  for (let row = retry.y; row < retry.y + retry.height; row++)
    for (let col = retry.x; col < retry.x + retry.width; col++)
      expect(frame.cells[row]![col]!.background).toBe(COLORS.gold)
  expect(screen).toContain('Esc Back')
  const later = workspaceFrame(s, w, h, 7)
  expect(later.cells.slice(brandHeaderRows(w, h))).toEqual(frame.cells.slice(brandHeaderRows(w, h)))
  expect(later.targets).toEqual(frame.targets)
  expect(workspaceInput('', { escape: true } as never, s, frame).action).toBe('setup-cancel')
})

it.each([
  [54, 24],
  [120, 36],
])('keeps the Versions control inside the model-card border at %i×%i', (width, height) => {
  const s = createWorkspace('setup')
  s.firstRun = null
  s.setup = {
    ...newSetup('server'),
    stage: 'models',
    repositories: [{ id: 'fixture', title: 'Fixture 4B with a long model name', downloads: 0 }],
  }
  const frame = workspaceFrame(s, width, height, 0)
  const card = frame.targets.find((t) => t.id === 'setup-repo:0')!
  const versions = frame.targets.find((t) => t.id === 'setup-variants:0')!
  expect(versions.x + versions.width).toBeLessThan(card.x + card.width - 1)
  expect(frame.cells[versions.y]![card.x + card.width - 1]!.char).toBe('|')
  expect(hit(frame, versions.x + 1, versions.y)?.id).toBe(versions.id)
  expect(hit(frame, card.x + 3, versions.y)?.id).toBe(card.id)
})
