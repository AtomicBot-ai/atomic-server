import { describe, expect, it, vi } from 'vitest'
import { defaultConfig } from '../config/index.js'
import { createLogger } from '../output/index.js'
import type { LogEntry } from '../output/index.js'
import { bootLoader, bootPlan, runBoot } from './boot.js'

describe('bootPlan', () => {
  it.each([
    ['defaults: API yes, no models', {}, { startApi: true, models: [] }],
    ['api.autoStart false', { api: { autoStart: false } }, { startApi: false, models: [] }],
    [
      'models trimmed, blanks and repeats dropped',
      { models: { autoLoad: [' qwen3-8b ', '', 'gemma-4b', 'qwen3-8b'] } },
      { startApi: true, models: ['qwen3-8b', 'gemma-4b'] },
    ],
  ])('%s', (_name, over, expected) => {
    const config = defaultConfig()
    if ('api' in over) config.api.autoStart = over.api.autoStart
    if ('models' in over) config.models.autoLoad = over.models.autoLoad
    expect(bootPlan(config)).toEqual(expected)
  })
})

describe('runBoot', () => {
  function deps() {
    const lines: LogEntry[] = []
    const calls: string[] = []
    return {
      lines,
      calls,
      deps: {
        startApi: vi.fn(async () => {
          calls.push('api')
        }),
        loadModel: vi.fn(async (model: string) => {
          calls.push(`load ${model}`)
          if (model === 'broken') throw new Error('no such model')
        }),
        log: createLogger((e) => lines.push(e), { level: 'debug' }),
      },
    }
  }

  it('starts the API first, then loads each model in order', async () => {
    const d = deps()
    await runBoot({ startApi: true, models: ['a', 'b'] }, d.deps)
    expect(d.calls).toEqual(['api', 'load a', 'load b'])
    expect(d.lines.map((l) => `${l.level} ${l.message}`)).toEqual([
      'info API started (api.autoStart)',
      'info a loaded (models.autoLoad)',
      'info b loaded (models.autoLoad)',
    ])
  })

  it('does nothing and says nothing when the config asks for nothing', async () => {
    const d = deps()
    await runBoot({ startApi: false, models: [] }, d.deps)
    expect(d.calls).toEqual([])
    expect(d.lines).toEqual([])
  })

  it('warns about a failure and goes on with the rest; it never throws', async () => {
    const d = deps()
    d.deps.startApi.mockRejectedValueOnce(new Error('port 1337 busy'))
    await expect(runBoot({ startApi: true, models: ['broken', 'ok'] }, d.deps)).resolves.toBeUndefined()
    expect(d.deps.startApi).toHaveBeenCalledTimes(1)
    expect(d.calls).toEqual(['load broken', 'load ok'])
    expect(d.lines.filter((l) => l.level === 'warn').map((l) => l.message)).toEqual([
      'API not started (api.autoStart): port 1337 busy',
      'broken not loaded (models.autoLoad): no such model',
    ])
  })
})

describe('bootLoader', () => {
  it('loads an installed model on the engine its row names, and refuses one that is not installed', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const execute = async (op: string, input: Record<string, unknown>) => {
      calls.push([op, input])
      if (op === 'models.installed') return [{ id: 'qwen3-8b', providers: ['llamacpp-upstream', 'llamacpp'] }]
      if (op === 'engines.list')
        return {
          engines: [
            { engine: 'llamacpp-upstream', kind: 'llamacpp', builds: [], active: null },
            { engine: 'llamacpp', kind: 'llamacpp', builds: [{ version: 'b1', variant: 'v' }], active: null },
          ],
        }
      return {}
    }
    const load = bootLoader(execute, 'llamacpp-upstream')
    await load('qwen3-8b')
    // The default is not installed; the TurboQuant build is: no download at boot.
    expect(calls.find(([op]) => op === 'models.load')).toEqual([
      'models.load',
      { provider: 'llamacpp', model_id: 'qwen3-8b' },
    ])
    calls.length = 0
    await expect(load('missing')).rejects.toThrow('missing is not installed')
    expect(calls).toEqual([['models.installed', {}]])
  })
})
