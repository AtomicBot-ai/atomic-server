import { describe, expect, it } from 'vitest'
import { chooseLoadEngine, installedEngines } from './load-engine.js'

const versions = [
  { engine: 'llamacpp-upstream', kind: 'llamacpp', builds: [], active: null },
  {
    engine: 'llamacpp',
    kind: 'llamacpp',
    builds: [{ version: 'b1', variant: 'macos-arm64' }],
    active: { version: 'b1', variant: 'macos-arm64' },
  },
  { engine: 'atomic-prism', kind: 'llamacpp', builds: [], active: null },
  { engine: 'mlx', kind: 'engine-build', builds: [], active: null },
  { engine: 'vllm', kind: 'managed', builds: [], active: { version: 'v', variant: 'x' } },
]

describe('installedEngines', () => {
  it('is every engine with a build or an active one, in display order', () => {
    expect(installedEngines(versions)).toEqual(['llamacpp', 'vllm'])
  })
})

describe('chooseLoadEngine', () => {
  it.each([
    ['the default when it is installed', 'llamacpp', [], { engine: 'llamacpp', instead: false }],
    [
      'an installed engine of the same family when the default is not',
      'llamacpp-upstream',
      [],
      { engine: 'llamacpp', instead: true },
    ],
    [
      "an installed engine the model lists, over the family's",
      'llamacpp-upstream',
      ['atomic-prism', 'llamacpp'],
      { engine: 'llamacpp', instead: true },
    ],
    ['the default when nothing of its family is installed', 'mlx', [], { engine: 'mlx', instead: false }],
    [
      'the default when the host does not even register it',
      'sglang',
      [],
      { engine: 'sglang', instead: false },
    ],
  ])('%s', (_name, fallback, providers, expected) => {
    expect(chooseLoadEngine(fallback, versions, providers)).toEqual(expected)
  })
})
