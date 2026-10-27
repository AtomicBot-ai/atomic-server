/**
 * `atc run` without --engine on a machine where `engines.default` is not installed: the installed build
 * of the same family, never a download; and the --engine hint names installed engines only.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AtomicCoreError } from '@atomic-chat/core'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const loads = (run: TestRun) => run.link.calls.filter((c) => c.path.endsWith('/load'))

describe('the engine a load goes to', () => {
  // The TurboQuant build is installed, upstream is not: a load without --engine must not fetch upstream.
  it('loads on the installed build of the same family when the default is not installed', async () => {
    t = testRun()
    t.link.responses['POST /engines/versions'] = {
      engines: [
        {
          engine: 'llamacpp-upstream',
          kind: 'llamacpp',
          builds: [],
          active: null,
          update: { needed: false },
        },
        {
          engine: 'llamacpp',
          kind: 'llamacpp',
          builds: [{ version: 'b1', variant: 'macos-arm64' }],
          active: { version: 'b1', variant: 'macos-arm64' },
          update: { needed: false },
        },
        { engine: 'mlx', kind: 'engine-build', builds: [], active: null, update: { needed: false } },
      ],
    }
    t.link.responses['GET /backends/llamacpp'] = { backends: [{ version: 'b1', backend: 'macos-arm64' }] }
    expect(await t.run(['run', 'm'])).toBe(0)
    expect(loads(t).map((c) => c.path)).toEqual(['/models/llamacpp/m/load'])
    expect(t.io.err.join('')).toContain('llamacpp-upstream is not installed')
    expect(t.io.out.join('')).toContain('m is running on llamacpp')
  })

  it('names only the installed engines when the default is not on this host', async () => {
    t = testRun()
    t.link.responses['POST /engines/versions'] = {
      engines: [
        {
          engine: 'llamacpp-upstream',
          kind: 'llamacpp',
          builds: [],
          active: null,
          update: { needed: false },
        },
        {
          engine: 'llamacpp',
          kind: 'llamacpp',
          builds: [{ version: 'b1', variant: 'macos-arm64' }],
          active: { version: 'b1', variant: 'macos-arm64' },
          update: { needed: false },
        },
        { engine: 'atomic-prism', kind: 'llamacpp', builds: [], active: null, update: { needed: false } },
      ],
    }
    expect(await t.run(['config', 'set', 'engines.default', 'vllm'])).toBe(0)
    expect(await t.run(['run', 'm'])).toBe(2)
    const err = t.io.err.join('')
    expect(err).toMatch(/--engine \(llamacpp\)/)
    expect(err).not.toContain('atomic-prism')
  })

  it('prints no log tail for a model that has none', async () => {
    t = testRun()
    t.link.responses['POST /engines/versions'] = {
      engines: [{ engine: 'llamacpp-upstream', builds: [], active: null }],
    }
    vi.spyOn(t.link.models, 'load').mockRejectedValue(
      new AtomicCoreError(
        'MODEL_NOT_FOUND',
        "Model 'nope' is not installed. Run `atomic-chat-cli models list` to see available models."
      )
    )
    t.link.responses['GET /backends/llamacpp-upstream'] = { backends: [{ version: 'b1', backend: 'cpu' }] }
    expect(await t.run(['run', 'nope'])).toBe(1)
    const err = t.io.err.join('')
    expect(err).not.toContain('Last lines of')
    expect(err).toContain('Run `atc models list`')
  })
})
