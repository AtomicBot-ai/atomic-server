import { AtomicCoreError } from '@atomic-chat/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import type { FakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { FixtureHttpServer } from '../../../test/helpers/fixture-http-server.js'
import { HF_SHA, qwenFiles, serveRepository } from '../../../test/helpers/hf-hub.js'
import { installation, environment } from '../../../test/helpers/managed-fixtures.js'
import { checkModel } from './managed-models.js'

const server = new FixtureHttpServer()
let hub: string
beforeAll(async () => {
  hub = await server.start()
})
afterAll(() => server.stop())
beforeEach(() => server.reset())

const REPO = 'Qwen/Qwen3.5-2B'
const ok = (engine: string) => ({
  architectures: ['Qwen3ForCausalLM'],
  quantization_format: null,
  weight_bytes: 6144,
  checked_gpu_id: 'GPU-1',
  curated: false,
  unified_memory: false,
  fits_other_gpus: [],
  verdict: { ok: true },
  engine,
})
const refused = (message: string) => ({
  ...ok('x'),
  verdict: { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message } },
})

/** A host registering llama.cpp and three managed engines, with `installed` installed. */
function link(installed: string[] = ['vllm']): FakeCoreLink {
  const l = fakeCoreLink()
  l.responses['POST /engines/versions'] = {
    engines: ['llamacpp-upstream', 'tensorrt-llm', 'vllm', 'sglang'].map((engine) => ({ engine })),
  }
  l.responses['GET /environments'] = {
    environments: [environment({ installations: installed.map((e) => installation(e)) })],
  }
  return l
}
const checks = (l: FakeCoreLink) => l.calls.filter((c) => c.path.endsWith('/check'))
const deps = (l: FakeCoreLink, env: Record<string, string> = {}) => ({
  link: l,
  fetch,
  env: { HF_ENDPOINT: hub, ...env },
})

describe('checkModel', () => {
  it("asks every managed engine the core registers, with the revision's check body, and reports each verdict", async () => {
    serveRepository(server, REPO, qwenFiles())
    const l = link(['vllm'])
    l.responses['POST /models/vllm/check'] = ok('vllm')
    l.responses['POST /models/sglang/check'] = ok('sglang')
    l.responses['POST /models/tensorrt-llm/check'] = refused('AutoAWQ is not supported by this release.')
    const result = await checkModel(deps(l, { HF_TOKEN: 'hf_x' }), { repository: REPO })
    expect(checks(l).map((c) => c.path)).toEqual([
      '/models/vllm/check',
      '/models/sglang/check',
      '/models/tensorrt-llm/check',
    ])
    expect(checks(l)[0]?.body).toMatchObject({
      repository: REPO,
      revision: HF_SHA,
      config_json: { architectures: ['Qwen3ForCausalLM'] },
      hf_quant_config_json: null,
      weight_names: ['lm_head.weight', 'model.layers.*.self_attn.q_proj.weight'],
    })
    expect(checks(l)[0]?.body).not.toHaveProperty('gpu_id')
    expect(result).toMatchObject({ repository: REPO, revision: HF_SHA })
    expect(result.verdicts.map((v) => [v.engine, v.installed, v.compatibility?.verdict.ok])).toEqual([
      ['vllm', true, true],
      ['sglang', false, true],
      ['tensorrt-llm', false, false],
    ])
    expect(server.requests.every((r) => r.authorization === 'Bearer hf_x')).toBe(true)
  })

  it('asks only the engine named', async () => {
    serveRepository(server, REPO, qwenFiles())
    const l = link()
    await checkModel(deps(l), { repository: `https://huggingface.co/${REPO}`, engine: 'vllm' })
    expect(checks(l).map((c) => c.path)).toEqual(['/models/vllm/check'])
  })

  it("keeps an engine's refusal to answer (no descriptor) as that engine's error", async () => {
    serveRepository(server, REPO, qwenFiles())
    const l = link()
    l.responses['POST /models/sglang/check'] = new AtomicCoreError(
      'MANAGED_METADATA_INVALID',
      'No sglang descriptor.'
    )
    const result = await checkModel(deps(l), { repository: REPO })
    expect(result.verdicts.find((v) => v.engine === 'sglang')).toMatchObject({
      compatibility: null,
      error: { code: 'MANAGED_METADATA_INVALID' },
    })
  })

  it('stops at a gated repository, naming HF_TOKEN, before any verdict', async () => {
    serveRepository(server, REPO, qwenFiles(), { gated: 401 })
    const l = link()
    await expect(checkModel(deps(l), { repository: REPO })).rejects.toThrow('HF_TOKEN')
    expect(checks(l)).toEqual([])
  })

  it('refuses an engine that is not managed, and a host with none', async () => {
    await expect(checkModel(deps(link()), { repository: REPO, engine: 'llamacpp' })).rejects.toThrow(
      'not a managed engine'
    )
    const none = fakeCoreLink()
    none.responses['POST /engines/versions'] = { engines: [{ engine: 'llamacpp-upstream' }] }
    await expect(checkModel(deps(none), { repository: REPO })).rejects.toThrow('no managed engine')
  })
})
