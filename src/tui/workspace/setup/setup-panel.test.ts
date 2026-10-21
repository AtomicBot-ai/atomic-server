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
