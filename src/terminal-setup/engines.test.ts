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
    if (path.endsWith('/install')) packs.push(body as (typeof packs)[number])
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
    expect(link.calls.some((c) => c.path.endsWith('/install'))).toBe(false)
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
