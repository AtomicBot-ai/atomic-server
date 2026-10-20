/** `atc run` and `atc models …` against a fake core: which provider a load goes to, what is refused. */
import { afterEach, describe, expect, it } from 'vitest'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())

/** `POST /engines/versions` for a host that registers these engines. */
const registered = (...engines: string[]) => ({
  engines: engines.map((engine) => ({ engine, builds: [], active: null, update: { needed: false } })),
})
const loads = (run: TestRun) => run.link.calls.filter((c) => c.path.endsWith('/load'))

describe('the default engine', () => {
  it('loads with the default engine when it is vLLM and the host registers it', async () => {
    t = testRun()
    t.link.responses['POST /engines/versions'] = registered('llamacpp-upstream', 'vllm')
    expect(await t.run(['config', 'set', 'engines.default', 'vllm'])).toBe(0)
    expect(await t.run(['run', 'Qwen/Qwen3.5-2B'])).toBe(0)
    expect(loads(t).map((c) => c.path)).toEqual(['/models/vllm/Qwen/Qwen3.5-2B/load'])
  })

  it('refuses an unknown provider and lists the ones it takes', async () => {
    t = testRun()
    expect(await t.run(['config', 'set', 'engines.default', 'trt'])).toBe(1)
    expect(t.io.err.join('')).toMatch(/one of llamacpp-upstream, .*tensorrt-llm, vllm, sglang, foundry-local/)
  })

  it('says the default engine is not on this host instead of loading, and names --engine', async () => {
    t = testRun()
    t.link.responses['POST /engines/versions'] = registered('llamacpp-upstream', 'llamacpp', 'mlx')
    expect(await t.run(['config', 'set', 'engines.default', 'vllm'])).toBe(0)
    expect(await t.run(['run', 'Qwen/Qwen3.5-2B'])).toBe(2)
    const err = t.io.err.join('')
    expect(err).toContain('vllm')
    expect(err).toContain('--engine')
    expect(loads(t)).toEqual([])
  })

  it('loads with a named engine without asking which engines the host has', async () => {
    t = testRun()
    t.link.responses['GET /backends/llamacpp'] = { backends: [{ version: 'b1', backend: 'cpu' }] }
    expect(await t.run(['run', 'm', '--engine', 'llamacpp'])).toBe(0)
    expect(loads(t).map((c) => c.path)).toEqual(['/models/llamacpp/m/load'])
    expect(t.link.calls.some((c) => c.path === '/engines/versions')).toBe(false)
  })
})
