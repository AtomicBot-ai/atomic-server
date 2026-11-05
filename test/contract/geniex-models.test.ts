import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { ModelRegistry } from '@atomic-chat/core/models'
import { defaultConfig } from '../../src/config/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

import { Crc64Nvme } from '../../src/workspace-service/geniex/crc64.js'
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
})
async function fixture(
  options: { gated?: boolean; refuse?: boolean; unsafe?: boolean; corruptChecksum?: boolean } = {}
) {
  const { paths, cleanup } = tmpDataFolder()
  cleanups.push(cleanup)
  await mkdir(paths.atcDir, { recursive: true })
  const model = Buffer.from('test weights'),
    projector = Buffer.from('test projector')
  const zip = Buffer.from(
    zipSync({ [options.unsafe ? '../escape' : 'bundle/genie_config.json']: strToU8('{}') })
  )
  const source = (path: string, bytes: Buffer) => ({
    path,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
  const common = {
    name: 'Example',
    description: 'Test model',
    license: 'MIT',
    task: 'chat',
    tools: true,
    reasoning: false,
    vision: true,
    context_length: 2048,
  }
  const hf = {
    kind: 'gguf',
    id: 'example',
    ...common,
    repo: 'org/example',
    revision: 'a'.repeat(40),
    gated: !!options.gated,
    devices: ['npu', 'gpu'],
    platforms: ['win-arm64'],
    file: source('model-Q4_0.gguf', model),
    mmproj: source('mmproj.gguf', projector),
  }
  const url = 'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/test.zip'
  const bundle = {
    kind: 'qairt',
    id: 'bundle',
    ...common,
    variants: ['x-elite', 'x2-elite'].map((chip) => ({
      id: chip,
      chip,
      precision: 'w4a16',
      bundle: { ...source('bundle.zip', zip), url },
    })),
  }
  const conf = join(paths.atcDir, 'geniex.json')
  await writeFile(
    conf,
    JSON.stringify({
      schema_version: 1,
      models: [hf, bundle],
      huggingface: { quantizations: ['Q4_0'], backends: { 'win-arm64': ['npu'] } },
    })
  )
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'geniex' }] }
  link.responses['GET /runtimes/geniex/accelerators'] = { installed: true, chip: 'x-elite', accelerators: [] }
  link.responses['POST /models/geniex/check'] = (body: { path?: string }) => ({
    verdict: options.refuse && body.path ? 'platform-unsupported' : 'ok',
    reason: null,
  })
  const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const req = String(input)
    const base =
      'https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/smollm/releases/v0.66.0/'
    const vendorZip = base + 'smollm.zip'
    const chipset = 'qualcomm-snapdragon-x-elite',
      runtime = 'RUNTIME_GENIEX_QAIRT'
    if (req.startsWith('https://pypi.org/')) return Response.json({ info: { version: '0.66.0' } })
    if (req.endsWith('/manifest.json'))
      return Response.json({
        version: '0.66.0',
        models: [
          {
            id: 'smollm',
            display_name: 'SmolLM',
            supported_chipsets: [chipset],
            supported_runtimes: [runtime],
            use_case: 'MODEL_USE_CASE_TEXT_GENERATION',
          },
        ],
      })
    if (req === base + 'release-assets.json')
      return Response.json({
        model_id: 'smollm',
        aihm_version: '0.66.0',
        assets: [
          { runtime, chipset, precision: 'PRECISION_W4A16', download_url: vendorZip },
          {
            runtime: 'RUNTIME_GENIEX_LLAMACPP',
            precision: 'PRECISION_MXFP4',
            download_url: 'https://huggingface.co/publisher/external/resolve/main/model-mxfp4.gguf',
          },
        ],
      })
    if (req === vendorZip && init?.method === 'HEAD') {
      const checksum = new Crc64Nvme()
      checksum.update(zip)
      return new Response(null, {
        headers: {
          'content-length': String(zip.length),
          'x-amz-version-id': 'test-version',
          'x-amz-checksum-type': 'FULL_OBJECT',
          'x-amz-checksum-crc64nvme': Buffer.from(
            options.corruptChecksum ? '0000000000000000' : checksum.hex(),
            'hex'
          ).toString('base64'),
        },
      })
    }
    if (req === vendorZip + '?versionId=test-version')
      return new Response(new Uint8Array(zip), { headers: { 'content-length': String(zip.length) } })
    if (req.includes('/api/models?')) return Response.json([{ id: 'third/example' }])
    if (req.includes('/publisher/external/revision/main?'))
      return Response.json({
        sha: 'a'.repeat(40),
        siblings: [
          { rfilename: 'model-mxfp4.gguf', lfs: { size: model.length, sha256: hf.file.sha256 } },
          { rfilename: 'mmproj.gguf', lfs: { size: projector.length, sha256: hf.mmproj.sha256 } },
        ],
      })
    if (req.includes('/revision/main?'))
      return Response.json({
        sha: 'b'.repeat(40),
        siblings: [{ rfilename: hf.file.path, lfs: { size: model.length, sha256: hf.file.sha256 } }],
      })
    const bytes = req === url ? zip : req.endsWith('mmproj.gguf') ? projector : model
    if (req === url) expect(new Headers(init?.headers).has('Authorization')).toBe(false)
    return new Response(new Uint8Array(bytes), { headers: { 'content-length': String(bytes.length) } })
  })
  const service = new WorkspaceService({
    paths,
    link,
    config: defaultConfig(),
    fetch: fetcher,
    env: {
      ATC_GENIEX_MODELS_URL: pathToFileURL(conf).href,
      ...(!options.gated ? { HF_TOKEN: 'fixture-token' } : {}),
    },
  })
  const registry = new ModelRegistry(paths.layout, 'geniex')
  async function install(model: string, variant?: string) {
    const plan = (await service.execute('geniex.plan', { model, ...(variant ? { variant } : {}) })) as {
      digest: string
      blockers: string[]
    }
    await service.execute('geniex.install', { plan_digest: plan.digest, request_id: 'test' })
    await vi.waitFor(async () => {
      const jobs = (await service.snapshot()).setups as { id: string; stage: string; error?: string }[]
      const job = jobs.find((j) => j.id === 'test')
      if (job?.stage === 'failed') throw new Error(job.error)
      expect(job?.stage).toBe('ready')
    })
  }
  return { registry, service, fetcher, install, link }
}
it('lists curated models first and restricts Qualcomm bundles to the chip, with HF only in search', async () => {
  const { service, fetcher } = await fixture()
  const catalog = await service.execute('models.catalog', { engine: 'geniex' })
  expect(catalog).toMatchObject({
    models: [
      { model_id: 'example', default_variant: 'npu' },
      { model_id: 'bundle', variants: [{ id: 'x-elite' }] },
    ],
  })
  expect(fetcher).not.toHaveBeenCalled()
  expect(await service.execute('models.search', { engine: 'geniex' })).toMatchObject({
    models: [
      {},
      {},
      { model_id: 'third/example', unverified: true },
      { model_id: 'qai-smollm-gguf-mxfp4', origin: 'qualcomm' },
      { model_id: 'qai-smollm', origin: 'qualcomm' },
    ],
  })
})
it.each([
  ['example', 'gpu', 'example', 'llama_cpp'],
  ['bundle', 'x-elite', 'x-elite', 'qairt'],
  ['third/example', 'npu', '', 'llama_cpp'],
])(
  'installs %s in the GenieX registry after checking the actual files',
  async (model, variant, id, plugin) => {
    const { registry, install, link } = await fixture()
    await install(model!, variant)
    const [entry] = await registry.list()
    expect(entry?.yml.geniex).toMatchObject({
      model_id: model,
      plugin,
      backend: plugin === 'qairt' ? 'npu' : variant,
    })
    if (id) expect(entry?.id).toBe(id)
    expect(
      link.calls.some((c) => c.path === '/models/geniex/check' && !!(c.body as { path?: string }).path)
    ).toBe(true)
    if (model === 'example')
      expect(await readFile(join(entry!.dir, 'mmproj.gguf'), 'utf8')).toBe('test projector')
    if (model === 'bundle') expect(await readFile(join(entry!.dir, 'genie_config.json'), 'utf8')).toBe('{}')
  }
)
it('can reinstall a removed model with the original request ID', async () => {
  const { service, registry, install } = await fixture()
  await install('example')
  await service.execute('models.remove', { model_id: 'example', store: 'geniex' })
  expect(await registry.list()).toEqual([])
  await install('example')
  expect(await registry.find('example')).toBeTruthy()
})
it('blocks gated downloads before requesting weights', async () => {
  const { install, registry, fetcher } = await fixture({ gated: true })
  await expect(install('example')).rejects.toThrow(/HF_TOKEN/)
  expect(await registry.list()).toEqual([])
  expect(fetcher).not.toHaveBeenCalled()
})
it.each([
  ['example', { refuse: true }, /platform-unsupported/],
  ['bundle', { unsafe: true }, /Unsafe path/],
] as const)('never registers refused %s files', async (model, options, reason) => {
  const { install, registry } = await fixture(options)
  await expect(install(model)).rejects.toThrow(reason)
  expect(await registry.list()).toEqual([])
})

it('installs a model outside the curated list from a versioned Qualcomm ZIP', async () => {
  const { registry, install, service } = await fixture()
  expect(await service.execute('models.search', { engine: 'geniex', query: 'smollm' })).toMatchObject({
    models: expect.arrayContaining([expect.objectContaining({ origin: 'qualcomm', model_id: 'qai-smollm' })]),
  })
  await install('qai-smollm')
  expect((await registry.list())[0]?.yml.geniex).toMatchObject({
    plugin: 'qairt',
    chip: 'x-elite',
    bundle_url: expect.stringContaining('?versionId=test-version'),
  })
})
it('rejects a Qualcomm ZIP when its bytes disagree with S3', async () => {
  const { registry, install } = await fixture({ corruptChecksum: true })
  await expect(install('qai-smollm')).rejects.toThrow(/checksum mismatch/)
  expect(await registry.list()).toEqual([])
})

it('installs the exact GGUF and vision projector listed by a Qualcomm search result', async () => {
  const { registry, install } = await fixture()
  await install('qai-smollm-gguf-mxfp4')
  const [entry] = await registry.list()
  expect(entry?.yml.geniex).toMatchObject({
    plugin: 'llama_cpp',
    repo: 'publisher/external',
    revision: 'a'.repeat(40),
    file: 'model-mxfp4.gguf',
    mmproj: 'mmproj.gguf',
  })
})
