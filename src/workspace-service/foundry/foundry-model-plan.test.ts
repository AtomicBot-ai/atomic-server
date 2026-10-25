// Fixtures: test/fixtures/foundry-local/ — the resolver's answer and the container listing as Azure gave them
// for qwen3-0.6b-generic-gpu, and Microsoft's catalog as the app's tests recorded it.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { foundryModelPlan } from './foundry-model-plan.js'
import { nodeStoreFiles } from '../managed/managed-model-setups.js'

const raw = (name: string) =>
  readFileSync(new URL(`../../../test/fixtures/foundry-local/${name}`, import.meta.url), 'utf8')
const CONF = {
  ...(JSON.parse(raw('foundry-local-models.json')) as { resolver: { regions: string[] } }),
  models: [],
}
const CATALOG = JSON.parse(raw('microsoft-catalog.json')) as { pages: unknown[] }
const CONTAINER = 'https://amlwlrt4use01.blob.core.windows.net/azureml-47d2813d'
const RESOLVED = (() => {
  const answer = JSON.parse(raw('resolve-qwen3-0.6b-generic-gpu.json')) as Record<string, unknown>
  return { ...answer, blobSasUri: `${CONTAINER}?sv=2025-01-05&sig=REDACTED` }
})()
const LISTING = raw('listing-qwen3-0.6b-generic-gpu.xml')
const scratch = mkdtempSync(join(tmpdir(), 'atc-fmp-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let n = 0

/** conf, the catalog, a resolver whose first region is down, and the container's listing. */
function web(over: { regions?: Record<string, number> } = {}) {
  const asked: string[] = []
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    asked.push(url)
    if (url.includes('foundry-local-models.json')) return Response.json(CONF)
    if (url.includes('asset-gallery')) {
      const token = (JSON.parse(String(init?.body)) as { continuationToken?: string }).continuationToken
      return Response.json(CATALOG.pages[token === 'page-2' ? 1 : 0])
    }
    const region = /^https:\/\/(\w+)\.api\.azureml\.ms\//.exec(url)?.[1]
    if (region) {
      const status = (over.regions ?? { eastus: 503 })[region] ?? 200
      return status === 200 ? Response.json(RESOLVED) : new Response('down', { status })
    }
    if (url.startsWith(CONTAINER) && url.includes('comp=list')) return new Response(`\uFEFF${LISTING}`)
    return new Response('?', { status: 404 })
  }) as typeof fetch
  return { request, asked }
}

function deps(w: ReturnType<typeof web>, free = 10 * 1024 ** 3) {
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'foundry-local' }] }
  link.responses['POST /models/foundry-local/check'] = { verdict: 'ok', reason: null, accelerator: null }
  link.disk.available = async () => free
  return {
    link,
    fetch: w.request,
    list: {
      cachePath: join(scratch, `cache-${++n}.json`),
      url: 'https://conf/models/foundry-local-models.json',
    },
    platform: 'linux',
    arch: 'x64',
    modelsDir: join(scratch, `models-${n}`),
    files: nodeStoreFiles,
  }
}
const VARIANT = { model: 'qwen2.5-7b-instruct', variant: 'qwen2.5-7b-instruct-generic-cpu' }

describe('foundryModelPlan for a Microsoft catalog model', () => {
  it('asks the next region when one is down, and lists the files from the container', async () => {
    const w = web()
    const plan = await foundryModelPlan(deps(w), VARIANT)
    const regions = w.asked.flatMap((u) => /^https:\/\/(\w+)\.api\.azureml\.ms\//.exec(u)?.[1] ?? [])
    expect(regions).toEqual(['eastus', 'westeurope'])
    expect(w.asked.find((u) => u.includes('comp=list'))).toContain(`&prefix=${encodeURIComponent('v2/')}`)
    expect(plan).toMatchObject({ unverified: true, prefix: 'v2', blockers: [] })
    expect(plan.files).toEqual([
      { path: 'chat_template.jinja', size: 4168 },
      { path: 'config.json', size: 9033 },
      { path: 'genai_config.json', size: 1752 },
      { path: 'model.onnx', size: 543321042 },
      { path: 'model_config.json', size: 37177 },
      { path: 'tokenizer.json', size: 11422647 },
      { path: 'tokenizer_config.json', size: 663 },
    ])
    expect(plan.pending).toHaveLength(7)
  })

  it("records the asset's tools, reasoning and its markers for model.yml", async () => {
    const plan = await foundryModelPlan(deps(web()), VARIANT)
    expect(plan.record).toMatchObject({
      tools: true,
      reasoning: true,
      reasoning_start: '<think>',
      reasoning_end: '</think>',
    })
  })

  it('says the model source is unavailable, naming every region, when none answers', async () => {
    const down = Object.fromEntries(CONF.resolver.regions.map((r) => [r, 503]))
    await expect(foundryModelPlan(deps(web({ regions: down })), VARIANT)).rejects.toMatchObject({
      message: 'The Foundry Local model source is unavailable.',
      details: expect.stringContaining('southeastasia: HTTP 503'),
    })
  })

  it('is blocked when the volume cannot hold what is left to download', async () => {
    const plan = await foundryModelPlan(deps(web(), 1024), VARIANT)
    expect(plan.blockers).toEqual(['Not enough free space for qwen2.5-7b-instruct-generic-cpu.'])
  })
})
