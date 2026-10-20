/** `atc run` and `atc models …` against a fake core: which provider a load goes to, what is refused. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { qwenFiles, serveRepository } from '../helpers/hf-hub.js'
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

describe('atc models check', () => {
  const server = new FixtureHttpServer()
  let hub = ''
  beforeAll(async () => {
    hub = await server.start()
  })
  afterAll(() => server.stop())
  const REPO = 'nvidia/Qwen3-8B-NVFP4'
  const verdict = (ok: boolean, message = '') => ({
    architectures: ['Qwen3ForCausalLM'],
    quantization_format: 'nvfp4',
    weight_bytes: 6 * 1024 ** 3,
    checked_gpu_id: 'GPU-0',
    curated: false,
    unified_memory: false,
    fits_other_gpus: [],
    verdict: ok ? { ok: true } : { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message } },
  })
  function host(gated?: number) {
    server.reset()
    serveRepository(server, REPO, qwenFiles(), gated ? { gated } : {})
    t = testRun({ io: { env: { HF_ENDPOINT: hub } } })
    t.link.responses['POST /engines/versions'] = registered('tensorrt-llm', 'vllm', 'sglang')
  }

  it('prints each engine’s refusal with the numbers when NVFP4 meets an Ada card', async () => {
    host()
    const cc = 'NVFP4 needs compute capability 10.0; GPU-0 has 8.9.'
    for (const engine of ['tensorrt-llm', 'vllm', 'sglang'])
      t.link.responses[`POST /models/${engine}/check`] = verdict(false, cc)
    expect(await t.run(['models', 'check', REPO])).toBe(0)
    const lines = t.io.out.join('').split('\n')
    for (const engine of ['tensorrt-llm', 'vllm', 'sglang']) {
      const line = lines.find((l) => l.startsWith(`${engine}`))
      expect(line).toContain('refused')
      expect(line).toContain('10.0')
      expect(line).toContain('8.9')
    }
  })

  it('shows ok for the engine that takes the model and the reason for the one that does not', async () => {
    host()
    t.link.responses['POST /models/vllm/check'] = verdict(true)
    t.link.responses['POST /models/tensorrt-llm/check'] = verdict(
      false,
      'AutoAWQ is not a format this release runs.'
    )
    t.link.responses['POST /models/sglang/check'] = verdict(true)
    expect(await t.run(['models', 'check', REPO, '--engine', 'vllm'])).toBe(0)
    expect(t.io.out.join('')).toMatch(/^vllm.*ok/m)
    t.io.out.length = 0
    expect(await t.run(['models', 'check', REPO, '--json'])).toBe(0)
    const doc = JSON.parse(t.io.out.join('')) as {
      verdicts: Array<{ engine: string; compatibility: { verdict: { ok: boolean } } }>
    }
    expect(doc.verdicts.map((v) => [v.engine, v.compatibility.verdict.ok])).toEqual([
      ['tensorrt-llm', false],
      ['vllm', true],
      ['sglang', true],
    ])
  })

  it('fails on a gated repository, naming it and HF_TOKEN, with no verdicts', async () => {
    host(403)
    expect(await t.run(['models', 'check', REPO])).not.toBe(0)
    expect(t.io.err.join('')).toContain(REPO)
    expect(t.io.err.join('')).toContain('HF_TOKEN')
    expect(t.link.calls.some((c) => c.path.endsWith('/check'))).toBe(false)
  })
})
