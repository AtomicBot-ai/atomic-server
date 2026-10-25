// Fixtures follow Atomic-Chat/web-app/src/services/managed-models/__tests__/models.test.ts @ 7cd5613aa: the repository, its listing and its files.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FixtureHttpServer } from '../../../test/helpers/fixture-http-server.js'
import { checkRequestFor, fetchHfRevision, foldTensorName, normalizeRepository } from './hf-revision.js'

const server = new FixtureHttpServer()
const REPO = 'nvidia/Qwen3-8B-FP8'
const SHA = 'c0ffee' + '0'.repeat(34)
let hub: string

/** A safetensors file: its 8-byte little-endian header length, the JSON header, then some weight bytes. */
function safetensors(names: string[], weightBytes = 64): Buffer {
  const header = Buffer.from(
    JSON.stringify({
      __metadata__: { format: 'pt' },
      ...Object.fromEntries(names.map((n) => [n, { dtype: 'F8_E4M3', shape: [2, 2], data_offsets: [0, 4] }])),
    })
  )
  const length = Buffer.alloc(8)
  length.writeBigUInt64LE(BigInt(header.length))
  return Buffer.concat([length, header, Buffer.alloc(weightBytes, 1)])
}

const listing = (quant: boolean) => ({
  sha: SHA,
  siblings: [
    { rfilename: 'config.json', size: 700 },
    ...(quant ? [{ rfilename: 'hf_quant_config.json', size: 200 }] : []),
    {
      rfilename: 'model-00001-of-00002.safetensors',
      size: 134,
      lfs: { sha256: 'a'.repeat(64), size: 5_000_000_000 },
    },
    {
      rfilename: 'model-00002-of-00002.safetensors',
      size: 134,
      lfs: { sha256: 'b'.repeat(64), size: 3_000_000_000 },
    },
    { rfilename: 'tokenizer.json', size: 11_000 },
  ],
})

function serve(options: { quant?: boolean; revision?: string } = {}) {
  const json = (value: unknown) => ({ body: Buffer.from(JSON.stringify(value)) })
  server.files.set(
    `/api/models/${REPO}/revision/${options.revision ?? 'main'}?blobs=true&files_metadata=true`,
    json(listing(options.quant ?? false))
  )
  server.files.set(`/${REPO}/resolve/${SHA}/config.json`, json({ architectures: ['Qwen3ForCausalLM'] }))
  server.files.set(
    `/${REPO}/resolve/${SHA}/hf_quant_config.json`,
    json({ quantization: { quant_algo: 'FP8' } })
  )
  server.files.set(`/${REPO}/resolve/${SHA}/model-00001-of-00002.safetensors`, {
    body: safetensors([
      'model.layers.0.mlp.gate_proj.weight',
      'model.layers.1.mlp.gate_proj.weight',
      'lm_head.weight',
    ]),
  })
  server.files.set(`/${REPO}/resolve/${SHA}/model-00002-of-00002.safetensors`, {
    body: safetensors(['model.layers.27.mlp.experts.7.w1.weight']),
  })
}

beforeAll(async () => {
  hub = await server.start()
})
afterAll(() => server.stop())
beforeEach(() => server.reset())

describe('fetchHfRevision', () => {
  it('pins the revision to its commit and lists every file with its size and LFS sha256', async () => {
    serve({ quant: true })
    const meta = await fetchHfRevision(REPO, undefined, { token: 'hf_secret', fetch, hub })
    expect(meta.revision).toBe(SHA)
    expect(meta.config_json).toEqual({ architectures: ['Qwen3ForCausalLM'] })
    expect(meta.hf_quant_config_json).toEqual({ quantization: { quant_algo: 'FP8' } })
    expect(meta.files).toContainEqual({
      path: 'model-00001-of-00002.safetensors',
      size: 5_000_000_000,
      sha256: 'a'.repeat(64),
    })
    expect(meta.files).toContainEqual({ path: 'tokenizer.json', size: 11_000, sha256: null })
    // Files are read at the pinned commit, never at a moving branch, always with the server's token.
    const files = server.requests.filter((r) => !r.path.startsWith('/api/'))
    expect(files.every((r) => r.path.includes(`/resolve/${SHA}/`))).toBe(true)
    expect(server.requests.every((r) => r.authorization === 'Bearer hf_secret')).toBe(true)
  })

  it('reads no quantization file a repository does not have, and resolves a named revision', async () => {
    serve({ revision: 'v1.0' })
    const meta = await fetchHfRevision(REPO, 'v1.0', { fetch, hub })
    expect(meta.hf_quant_config_json).toBeNull()
    expect(server.requests.some((r) => r.path.includes('hf_quant_config.json'))).toBe(false)
  })

  it('reads the tensor names from the weight headers with ranges only, folding numeric segments', async () => {
    serve()
    const meta = await fetchHfRevision(REPO, undefined, { fetch, hub })
    expect(meta.weight_names).toEqual([
      'lm_head.weight',
      'model.layers.*.mlp.experts.*.w1.weight',
      'model.layers.*.mlp.gate_proj.weight',
    ])
    const weights = server.requests.filter((r) => r.path.endsWith('.safetensors'))
    expect(weights.length).toBeGreaterThan(0)
    expect(weights.every((r) => r.range?.startsWith('bytes=0-'))).toBe(true)
  })

  it('leaves the names out when a header cannot be read with a range', async () => {
    serve()
    server.files.set(`/${REPO}/resolve/${SHA}/model-00002-of-00002.safetensors`, {
      body: safetensors(['x.weight']),
      ranges: false,
    })
    const meta = await fetchHfRevision(REPO, undefined, { fetch, hub })
    expect(meta.weight_names).toBeUndefined()
  })

  it.each([401, 403])('names the repository and HF_TOKEN when Hugging Face answers %i', async (status) => {
    server.files.set(`/api/models/${REPO}/revision/main?blobs=true&files_metadata=true`, {
      body: Buffer.from('{"error":"gated"}'),
      failStatus: status,
      failTimes: 1,
    })
    await expect(fetchHfRevision(REPO, undefined, { fetch, hub })).rejects.toThrow(
      /nvidia\/Qwen3-8B-FP8.*HF_TOKEN|HF_TOKEN.*nvidia\/Qwen3-8B-FP8/s
    )
  })
})

describe('helpers', () => {
  it.each([
    ['model.layers.12.mlp.experts.7.w1', 'model.layers.*.mlp.experts.*.w1'],
    ['lm_head.weight', 'lm_head.weight'],
    ['0.weight', '*.weight'],
  ])('folds %s', (name, folded) => expect(foldTensorName(name)).toBe(folded))

  it.each([
    [' https://huggingface.co/Qwen/Qwen3.5-2B/ ', 'Qwen/Qwen3.5-2B'],
    ['huggingface.co/Qwen/Qwen3.5-2B', 'Qwen/Qwen3.5-2B'],
    ['Qwen/Qwen3.5-2B', 'Qwen/Qwen3.5-2B'],
  ])('normalizes %j', (input, repo) => expect(normalizeRepository(input)).toBe(repo))

  it('builds the check body, with the card and the names only when there are some', async () => {
    serve({ quant: true })
    const meta = await fetchHfRevision(REPO, undefined, { fetch, hub })
    expect(checkRequestFor(meta, 'GPU-1')).toMatchObject({ repository: REPO, revision: SHA, gpu_id: 'GPU-1' })
    const { weight_names: _names, ...unnamed } = meta
    expect(checkRequestFor(unnamed)).not.toHaveProperty('weight_names')
  })
})
