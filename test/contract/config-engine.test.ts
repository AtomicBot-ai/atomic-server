/** `atc config get|set|list` for `engine.<provider>.<key>` (spec server-engine-settings). */
import { afterEach, describe, expect, it } from 'vitest'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')
const patches = () => t.link.calls.filter((c) => c.method === 'PATCH')

/** A core with TensorRT-LLM and SGLang registered and their settings at `values`, revision 7. */
function server(values: Record<string, unknown> = {}, running = true) {
  t = testRun({ running })
  t.link.responses['POST /engines/versions'] = {
    engines: ['llamacpp-upstream', 'tensorrt-llm', 'sglang'].map((engine) => ({ engine })),
  }
  t.link.responses['GET /settings/tensorrt-llm'] = { revision: 7, values }
  t.link.responses['GET /settings/sglang'] = { revision: 7, values: {} }
  t.link.responses['PATCH /settings/tensorrt-llm'] = (body: unknown) => ({
    revision: 8,
    values: { ...values, ...(body as { values: object }).values },
  })
}

describe('atc config … engine.<provider>.<key>', () => {
  it('sets the TensorRT-LLM context length with the revision it read, says when it applies', async () => {
    server()
    expect(await t.run(['config', 'set', 'engine.tensorrt-llm.context_length', '16384'])).toBe(0)
    expect(patches()).toEqual([
      expect.objectContaining({
        path: '/settings/tensorrt-llm',
        body: { values: { context_length: 16384 }, expected_revision: 7 },
      }),
    ])
    expect(`${out()}${err()}`).toContain('next model load')
  })

  it('prints the core’s current value', async () => {
    server({ context_length: 16384 })
    expect(await t.run(['config', 'get', 'engine.tensorrt-llm.context_length'])).toBe(0)
    expect(out().trim()).toBe('16384')
  })

  it('prints the schema default for a key the core has no value for', async () => {
    server()
    expect(await t.run(['config', 'get', 'engine.tensorrt-llm.context_length'])).toBe(0)
    expect(out().trim()).toBe('8192')
  })

  it('refuses a value outside the schema with its range, changing nothing', async () => {
    server()
    expect(await t.run(['config', 'set', 'engine.sglang.mem_fraction_static', '1.5'])).toBe(2)
    expect(err()).toMatch(/between 0 and 0\.99/)
    expect(patches()).toEqual([])
  })

  it('refuses version_backend and points at atc engines activate', async () => {
    server()
    expect(await t.run(['config', 'set', 'engine.llamacpp.version_backend', 'b1234/linux-cuda12-x64'])).toBe(
      2
    )
    expect(err()).toContain('atc engines activate')
    expect(patches()).toEqual([])
  })

  it('refuses an unknown key with the schema’s keys, and an unknown provider', async () => {
    server()
    expect(await t.run(['config', 'set', 'engine.tensorrt-llm.ctx', '1'])).toBe(2)
    expect(err()).toContain('context_length')
    t.io.err.length = 0
    expect(await t.run(['config', 'get', 'engine.nope.ctx'])).toBe(2)
    expect(err()).toMatch(/tensorrt-llm/)
  })

  it('says the server is not running instead of reading or writing', async () => {
    server({}, false)
    expect(await t.run(['config', 'set', 'engine.tensorrt-llm.context_length', '16384'])).not.toBe(0)
    expect(err()).toMatch(/daemon is running|not running/i)
    expect(t.link.calls.some((c) => c.path.startsWith('/settings'))).toBe(false)
  })

  it('lists the engine keys of the providers this host registers', async () => {
    server({ context_length: 16384 })
    expect(await t.run(['config', 'list']), err()).toBe(0)
    expect(out()).toMatch(/engine\.tensorrt-llm\.context_length\s+16384\s+core/)
    expect(out()).toContain('engine.sglang.mem_fraction_static')
    expect(out()).not.toContain('engine.vllm.')
  })
})
