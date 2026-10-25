// Fixtures: test/fixtures/foundry-local/ — Microsoft's catalog as the app's tests recorded it, conf's list as main has it.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { foundrySearch } from './foundry-catalog.js'

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../test/fixtures/foundry-local/${name}`, import.meta.url), 'utf8')
  ) as Record<string, unknown>
const CATALOG = fixture('microsoft-catalog.json') as { pages: unknown[] }
const CONF = fixture('foundry-local-models.json')
const scratch = mkdtempSync(join(tmpdir(), 'atc-flc-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let n = 0

/** conf's list and Microsoft's catalog over `fetch`; either may be down. */
function web(options: { conf?: unknown; confDown?: boolean; catalogDown?: boolean } = {}) {
  const asked: string[] = []
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    asked.push(url)
    if (url.includes('foundry-local-models.json'))
      return options.confDown ? new Response('down', { status: 503 }) : Response.json(options.conf ?? CONF)
    if (url.includes('asset-gallery')) {
      if (options.catalogDown) return new Response('down', { status: 503 })
      const token = (JSON.parse(String(init?.body)) as { continuationToken?: string }).continuationToken
      return Response.json(CATALOG.pages[token === 'page-2' ? 1 : 0])
    }
    return new Response('?', { status: 404 })
  }) as typeof fetch
  return { request, asked }
}

/** A core that registers Foundry Local, with the NPU's accelerator not prepared yet. */
function core(registered = true) {
  const l = fakeCoreLink()
  l.responses['POST /engines/versions'] = { engines: registered ? [{ engine: 'foundry-local' }] : [] }
  l.responses['POST /models/foundry-local/check'] = (body: unknown) => {
    const { execution_provider, device } = body as { execution_provider: string; device: string }
    if (device === 'npu')
      return {
        verdict: 'accelerator-not-prepared',
        reason: 'Prepare the NPU first.',
        accelerator: 'OpenVINOExecutionProvider',
      }
    if (execution_provider === 'cuda')
      return {
        verdict: 'accelerator-unavailable',
        reason: 'No NVIDIA GPU.',
        accelerator: 'CUDAExecutionProvider',
      }
    return { verdict: 'ok', reason: null, accelerator: null }
  }
  return l
}
const deps = (
  w: ReturnType<typeof web>,
  platform = 'win32',
  arch = 'x64',
  cachePath = join(scratch, `cache-${++n}.json`)
) => ({
  link: core(),
  fetch: w.request,
  list: { cachePath, url: 'https://conf/models/foundry-local-models.json' },
  platform,
  arch,
})

describe('foundrySearch', () => {
  it("shows the catalog's chat models for this platform, unverified, when conf's list is empty", async () => {
    const result = await foundrySearch(deps(web()))
    expect(result.models.map((m) => m.model_id)).toEqual([
      'mistral-nemo-12b-instruct',
      'olmo-3-7b-instruct',
      'qwen2.5-7b-instruct',
    ])
    expect(result.models.every((m) => m.origin === 'microsoft' && m.unverified)).toBe(true)
    const qwen = result.models.find((m) => m.model_id === 'qwen2.5-7b-instruct')!
    // win-x64: OpenVINO and Vitis NPUs, OpenVINO GPU, WebGPU, CUDA, CPU — not QNN (Arm) nor TensorRT-RTX.
    expect(qwen.variants.map((v) => v.id).sort()).toEqual(
      ['cuda-gpu', 'generic-cpu', 'generic-gpu', 'openvino-gpu', 'openvino-npu', 'vitis-npu']
        .map((s) => `qwen2.5-7b-instruct-${s}`)
        .sort()
    )
  })

  it('gives each variant the core’s verdict, and opens on the NPU that only needs preparing', async () => {
    const qwen = (await foundrySearch(deps(web()), 'qwen')).models[0]!
    expect(qwen.variants.find((v) => v.device === 'npu')?.verdict.verdict).toBe('accelerator-not-prepared')
    expect(qwen.variants.find((v) => v.execution_provider === 'cuda')?.verdict.verdict).toBe(
      'accelerator-unavailable'
    )
    expect(qwen.default_variant).toMatch(/-npu$/)
  })

  it('opens on a GPU variant that runs when no NPU does, before the CPU', async () => {
    const link = core()
    const check = link.responses['POST /models/foundry-local/check'] as (b: unknown) => unknown
    link.responses['POST /models/foundry-local/check'] = (body: unknown) =>
      (body as { device: string }).device === 'npu'
        ? { verdict: 'accelerator-unavailable', reason: 'No NPU.', accelerator: null }
        : check(body)
    const qwen = (await foundrySearch({ ...deps(web()), link }, 'qwen2.5')).models[0]!
    const chosen = qwen.variants.find((v) => v.id === qwen.default_variant)
    expect(chosen).toMatchObject({ device: 'gpu', verdict: { verdict: 'ok' } })
  })

  it('keeps only the variants of another platform (Linux x64: CPU and CUDA)', async () => {
    const qwen = (await foundrySearch(deps(web(), 'linux', 'x64'), 'qwen2.5')).models[0]!
    expect(qwen.variants.map((v) => v.execution_provider).sort()).toEqual(['cpu', 'cuda'])
    expect(qwen.default_variant).toBe('qwen2.5-7b-instruct-generic-cpu')
  })

  it("lists conf's curated models first, verified, and leaves their catalog twins out", async () => {
    const curated = {
      ...CONF,
      models: [
        {
          id: 'qwen2.5-7b',
          name: 'Qwen2.5 7B',
          description: 'Checked by Atomic Chat.',
          task: 'chat',
          license: 'apache-2.0',
          context_length: 32768,
          tools: true,
          reasoning: false,
          variants: [
            {
              id: 'qwen2.5-7b-cpu',
              device: 'cpu',
              execution_provider: 'cpu',
              platforms: ['win-x64', 'linux-x64'],
              source: {
                kind: 'azureml',
                asset_id: 'azureml://registries/azureml/models/qwen2.5-7b-instruct-generic-cpu/versions/4',
                version: '4',
                path_prefix: 'v1',
              },
              files: [{ path: 'model.onnx', size: 10, sha256: 'a'.repeat(64) }],
            },
          ],
        },
      ],
    }
    const result = await foundrySearch(deps(web({ conf: curated })), 'qwen')
    expect(result.models[0]).toMatchObject({ origin: 'curated', unverified: false, model_id: 'qwen2.5-7b' })
    const catalogQwen = result.models.find((m) => m.origin === 'microsoft')!
    expect(catalogQwen.variants.some((v) => v.id === 'qwen2.5-7b-instruct-generic-cpu')).toBe(false)
  })

  it("uses the last copy of conf's list when conf is down, and says so; the curated list stands alone without the catalog", async () => {
    const cachePath = join(scratch, `cache-${++n}.json`)
    writeFileSync(cachePath, JSON.stringify({ value: CONF, fetchedAt: 0 }))
    const result = await foundrySearch(
      deps(web({ confDown: true, catalogDown: true }), 'win32', 'x64', cachePath)
    )
    expect(result).toMatchObject({ list_source: 'cache', catalog_unavailable: true, models: [] })
    expect(result.list_error).toContain('503')
  })

  it("reads conf's list once an hour", async () => {
    const w = web()
    const d = deps(w)
    await foundrySearch(d)
    await foundrySearch(d)
    expect(w.asked.filter((u) => u.includes('foundry-local-models.json'))).toHaveLength(1)
  })

  it('says Foundry Local is not available where the core does not register it', async () => {
    const d = { ...deps(web()), link: core(false) }
    await expect(foundrySearch(d)).rejects.toThrow('not available on this platform')
  })
})
