import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { EngineSelection, engineName, modelProvider } from './engines.js'
import type { BackendCatalogResponse } from './types.js'

it('lists installed/recommended builds, installs on demand and persists only successful selections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-engine-picker-')),
    link = fakeCoreLink()
  const packs = [{ version: 'v1', backend: 'cpu' }]
  link.request = async <T>(method: string, path: string, body?: unknown) => {
    link.calls.push({ method, path, body })
    if (method === 'GET') return { backends: packs } as T
    if (path === '/engines/versions')
      return { engines: [{ engine: 'llamacpp-upstream', latest: { version: 'v2', variant: 'cpu' } }] } as T
    if (path.endsWith('/update')) {
      const { target } = body as { target: { version: string; variant: string } }
      packs.push({ version: target.version, backend: target.variant })
    }
    return {} as T
  }
  const service = new EngineSelection(directory, async () => link)
  try {
    const choices = await service.list([
      {
        provider: 'llamacpp-upstream',
        recommended: 'v2/cpu',
        available: [{ version: 'v2', backend: 'cpu' }],
      } as BackendCatalogResponse,
    ])
    expect(choices.map((c) => c.installed)).toEqual([true, false])
    await service.select(choices[0]!)
    expect(link.calls.some((c) => c.path.endsWith('/update'))).toBe(false)
    await service.select(choices[1]!)
    expect(packs).toHaveLength(2)
    expect(await new EngineSelection(directory, async () => link).read()).toBe('llamacpp-upstream|v2|cpu')
    link.request = async () => {
      throw new Error('Install failed')
    }
    await expect(service.select(choices[0]!)).rejects.toThrow('Install failed')
    expect(await service.read()).toBe('llamacpp-upstream|v2|cpu')
    expect(engineName('llamacpp')).toBe('llama.cpp TurboQuant')
    expect(modelProvider('llamacpp|v2|cpu', 'llamacpp-upstream')).toBe('llamacpp')
    expect(modelProvider('llamacpp|v2|cpu', 'atomic-prism')).toBe('atomic-prism')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// The core applies a choice: it writes `version_backend` in the load queue's turn, unloads the old
// build's sessions and announces `engine:changed`. A settings write here would skip all three.
it('applies a choice through the core and never writes version_backend itself', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-engine-apply-')),
    link = fakeCoreLink()
  const service = new EngineSelection(directory, async () => link)
  const choice = { provider: 'llamacpp-upstream', version: 'v2', backend: 'cpu' }
  try {
    await service.select({ ...choice, id: 'llamacpp-upstream|v2|cpu', installed: true })
    await service.select({ ...choice, id: 'llamacpp-upstream|v2|cpu', installed: false })
    expect(link.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /engines/llamacpp-upstream/builds/v2/cpu/activate',
      'POST /engines/llamacpp-upstream/update',
    ])
    expect(link.calls[1]?.body).toMatchObject({ target: { version: 'v2', variant: 'cpu' } })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// The build to offer is the core's choice (`latest` in /engines/versions), not the catalog's first row.
it('offers the build the core names as latest, and none when the core offers none', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-engine-latest-')),
    link = fakeCoreLink()
  link.responses['GET /backends/llamacpp-upstream'] = { backends: [] }
  link.responses['GET /backends/llamacpp'] = { backends: [] }
  link.responses['POST /engines/versions'] = {
    engines: [
      { engine: 'llamacpp-upstream', latest: { version: 'b2', variant: 'vulkan' } },
      { engine: 'llamacpp', latest: null },
    ],
  }
  const catalog = (provider: string) =>
    ({
      provider,
      recommended: null,
      available: [{ version: 'b9', backend: 'cpu' }],
    }) as unknown as BackendCatalogResponse
  try {
    const choices = await new EngineSelection(directory, async () => link).list([
      catalog('llamacpp-upstream'),
      catalog('llamacpp'),
    ])
    expect(choices.map((c) => c.id)).toEqual(['llamacpp-upstream|b2|vulkan'])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// Installed managed engines, Foundry Local and LiteRT-LM are choices too (spec server-engine-settings); a
// pick remembers the engine: there is no llama.cpp build to activate.
it('adds installed managed engines, Foundry Local and LiteRT-LM after llama.cpp, and selects them without activating a build', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-engine-managed-')),
    link = fakeCoreLink()
  link.responses['GET /backends/llamacpp-upstream'] = { backends: [{ version: 'b1', backend: 'cpu' }] }
  link.responses['POST /engines/versions'] = {
    engines: [
      { engine: 'llamacpp-upstream', latest: null, active: null },
      { engine: 'litert-lm', active: { version: '0.18.1', variant: 'win-x64' } },
      { engine: 'foundry-local', active: { version: 'v2.1.0', variant: 'win-x64' } },
      { engine: 'tensorrt-llm', active: { version: 'trt-1', variant: 'linux/amd64' } },
      { engine: 'sglang', active: null },
      { engine: 'vllm', active: { version: 'vllm-1', variant: 'linux/amd64' } },
    ],
  }
  try {
    const selection = new EngineSelection(directory, async () => link)
    const choices = await selection.list([
      {
        provider: 'llamacpp-upstream',
        recommended: null,
        available: [],
      } as unknown as BackendCatalogResponse,
    ])
    expect(choices.map((c) => c.provider)).toEqual([
      'llamacpp-upstream',
      'vllm',
      'tensorrt-llm',
      'foundry-local',
      'litert-lm',
    ])
    expect(choices.slice(1).every((c) => c.installed)).toBe(true)
    link.calls.length = 0
    await selection.select(choices[1]!)
    expect(link.calls).toEqual([])
    expect(await selection.read()).toBe(choices[1]!.id)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
