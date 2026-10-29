import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { EngineSelection, setsUpInPanel } from './engines.js'
import type { BackendCatalogResponse } from './types.js'

it.each([true, false])(
  'offers core-registered MLX (installed=%s), excluding diffusion engines',
  async (installed) => {
    const directory = await mkdtemp(join(tmpdir(), 'atc-mlx-choice-'))
    const link = fakeCoreLink()
    link.responses['POST /engines/versions'] = {
      engines: [
        { engine: 'sd-cpp', active: { version: 'sd', variant: 'cpu' } },
        {
          engine: 'mlx',
          active: installed ? { version: 'mlx1', variant: 'macos-arm64' } : null,
          latest: { version: 'mlx2', variant: 'macos-arm64' },
        },
      ],
    }
    try {
      const selection = new EngineSelection(directory, async () => link)
      const choices = await selection.list([])
      expect(choices).toEqual([
        {
          id: 'mlx',
          provider: 'mlx',
          version: installed ? 'mlx1' : 'mlx2',
          backend: 'macos-arm64',
          installed,
        },
      ])
      expect(setsUpInPanel(choices[0]!)).toBe(!installed)
      if (installed) {
        link.calls.length = 0
        await selection.select(choices[0]!)
        expect(await selection.read()).toBe('mlx')
        expect(link.calls).toEqual([])
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)

it('keeps the active build reported by the core distinct from installed and latest builds', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atc-active-choice-'))
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = {
    engines: [
      {
        engine: 'llamacpp-upstream',
        active: { version: 'b2', variant: 'cpu' },
        latest: { version: 'b3', variant: 'cpu' },
      },
    ],
  }
  link.responses['GET /backends/llamacpp-upstream'] = {
    backends: [
      { version: 'b1', backend: 'cpu' },
      { version: 'b2', backend: 'cpu' },
    ],
  }
  try {
    const choices = await new EngineSelection(directory, async () => link).list([
      {
        provider: 'llamacpp-upstream',
        recommended: null,
        available: [],
      } as unknown as BackendCatalogResponse,
    ])
    expect(choices.map(({ version, installed, active }) => ({ version, installed, active }))).toEqual([
      { version: 'b1', installed: true, active: false },
      { version: 'b2', installed: true, active: true },
      { version: 'b3', installed: false, active: false },
    ])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
