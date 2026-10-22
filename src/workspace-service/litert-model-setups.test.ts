import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Downloader } from '../downloads/index.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import type { FakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import { LiteRtModelSetups } from './litert-model-setups.js'

const hub = new FixtureHttpServer()
const cdn = new FixtureHttpServer()
let hubBase = ''
let cdnBase = ''
beforeAll(async () => {
  hubBase = await hub.start()
  cdnBase = await cdn.start()
})
afterAll(async () => {
  await hub.stop()
  await cdn.stop()
})

const REPO = 'litert-community/gemma-4-E4B-it-litert-lm'
const REV = '1'.repeat(40)
const GPU = Buffer.from('gpu weights')
const CPU = Buffer.from('cpu weights, a little longer')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** conf's list with one model of a GPU and a CPU variant whose files the Hub serves. */
function confList(dir: string, over: { gated?: boolean; gpuSha?: string } = {}) {
  const variant = (id: string, backend: string, path: string, body: Buffer, digest = sha(body)) => ({
    id,
    backend,
    platforms: ['linux-x64', 'macos-arm64'],
    file: { path, size: body.length, sha256: digest },
  })
  const list = {
    schema_version: 1,
    updated_at: '2026-10-21T00:00:00Z',
    huggingface: { orgs: [], filter: 'litert-lm', backends: {} },
    models: [
      {
        id: 'gemma-4-e4b',
        name: 'Gemma 4 E4B',
        description: 'Gemma 4.',
        task: 'chat',
        license: 'gemma',
        repo: REPO,
        revision: REV,
        gated: over.gated ?? false,
        context_length: 32768,
        tools: true,
        reasoning: true,
        vision: true,
        variants: [
          variant('gemma-4-e4b-gpu', 'gpu', 'gemma-4-E4B-it-gpu.litertlm', GPU, over.gpuSha),
          variant('gemma-4-e4b-cpu', 'cpu', 'gemma-4-E4B-it.litertlm', CPU),
        ],
      },
    ],
  }
  const path = join(dir, 'list.json')
  writeFileSync(path, JSON.stringify(list))
  return pathToFileURL(path).href
}

let dirs: string[] = []
afterEach(() => {
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
  dirs = []
  hub.reset()
  cdn.reset()
})

function setups(o: { token?: string; gated?: boolean; gpuSha?: string; verdict?: string } = {}) {
  const data = mkdtempSync(join(tmpdir(), 'atc-litert-setups-'))
  dirs.push(data)
  hub.files.set(`/${REPO}/resolve/${REV}/gemma-4-E4B-it-gpu.litertlm`, { body: GPU })
  hub.files.set(`/${REPO}/resolve/${REV}/gemma-4-E4B-it.litertlm`, { body: CPU })
  const link: FakeCoreLink = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'litert-lm' }] }
  link.responses['POST /models/litert-lm/check'] = (body: { path?: string }) =>
    body.path && o.verdict
      ? { verdict: o.verdict, reason: 'the file has no GPU backend' }
      : {
          verdict: 'ok',
          reason: null,
          ...(body.path
            ? {
                metadata: {
                  max_context_tokens: 8192,
                  function_calling: false,
                  thinking: true,
                  modalities: ['text'],
                },
              }
            : {}),
        }
  const modelsDir = join(data, 'litert-lm', 'models')
  const s = new LiteRtModelSetups({
    link,
    fetch,
    list: { cachePath: join(data, 'cache.json'), url: confList(data, o) },
    platform: 'linux',
    arch: 'x64',
    hub: hubBase,
    token: o.token,
    modelsDir,
    directory: join(data, 'jobs'),
    downloader: new Downloader({ dataFolder: data, platform: process.platform, fetch, retryBaseMs: 1 }),
  })
  return { s, link, modelsDir }
}
const settle = async (s: LiteRtModelSetups, id: string) => {
  await waitFor(
    async () =>
      !['queued', 'downloading', 'verifying'].includes((await s.list()).find((j) => j.id === id)?.stage ?? '')
  )
  return (await s.list()).find((j) => j.id === id)!
}

describe('LiteRtModelSetups.plan', () => {
  it('takes the variant named, else --backend, else NPU, GPU, CPU among those the core says run', async () => {
    const { s } = setups()
    expect((await s.plan({ model: 'gemma-4-e4b' })).variant_id).toBe('gemma-4-e4b-gpu')
    expect((await s.plan({ model: 'gemma-4-e4b', backend: 'cpu' })).variant_id).toBe('gemma-4-e4b-cpu')
    expect((await s.plan({ model: 'gemma-4-e4b-cpu' })).variant_id).toBe('gemma-4-e4b-cpu')
  })

  it('refuses a gated model without HF_TOKEN before anything is downloaded, naming the terms’ page', async () => {
    const { s, modelsDir } = setups({ gated: true })
    const plan = await s.plan({ model: 'gemma-4-e4b' })
    expect(plan.blockers.join(' ')).toContain('HF_TOKEN')
    expect(plan.blockers.join(' ')).toContain(`https://huggingface.co/${REPO}`)
    await expect(s.install({ request_id: 'r1', plan_digest: plan.digest })).rejects.toThrow('HF_TOKEN')
    expect(existsSync(modelsDir)).toBe(false)
  })
})

describe('LiteRtModelSetups.install', () => {
  it('downloads the file, has the core check it, and writes model.yml last', async () => {
    const { s, link, modelsDir } = setups()
    const plan = await s.plan({ model: 'gemma-4-e4b' })
    await s.install({ request_id: 'r1', plan_digest: plan.digest })
    expect((await settle(s, 'r1')).stage).toBe('ready')
    const dir = join(modelsDir, 'gemma-4-e4b-gpu')
    expect(readFileSync(join(dir, 'gemma-4-E4B-it-gpu.litertlm'))).toEqual(GPU)
    const check = link.calls.filter((c) => c.path === '/models/litert-lm/check').at(-1)
    expect(check?.body).toEqual({ path: join(dir, 'gemma-4-E4B-it-gpu.litertlm'), backend: 'gpu' })
    const yml = readFileSync(join(dir, 'model.yml'), 'utf8')
    expect(yml).toContain('model_path: litert-lm/models/gemma-4-e4b-gpu/gemma-4-E4B-it-gpu.litertlm')
    expect(yml).toMatch(/litert_lm:[\s\S]*variant_id: gemma-4-e4b-gpu[\s\S]*source: curated/)
    expect(yml).toMatch(/tools: true/)
  })

  it('fails on a sha256 that does not match, deleting the file and writing no model.yml', async () => {
    const { s, modelsDir } = setups({ gpuSha: 'f'.repeat(64) })
    const plan = await s.plan({ model: 'gemma-4-e4b' })
    await s.install({ request_id: 'r1', plan_digest: plan.digest })
    const job = await settle(s, 'r1')
    expect(job.stage).toBe('failed')
    expect(existsSync(join(modelsDir, 'gemma-4-e4b-gpu', 'gemma-4-E4B-it-gpu.litertlm'))).toBe(false)
    expect(existsSync(join(modelsDir, 'gemma-4-e4b-gpu', 'model.yml'))).toBe(false)
  })

  it('removes the variant’s folder when the core refuses the downloaded file, and says why', async () => {
    const { s, modelsDir } = setups({ verdict: 'platform-unsupported' })
    const plan = await s.plan({ model: 'gemma-4-e4b' })
    await s.install({ request_id: 'r1', plan_digest: plan.digest })
    const job = await settle(s, 'r1')
    expect(job.stage).toBe('failed')
    expect(job.error).toContain('the file has no GPU backend')
    expect(existsSync(join(modelsDir, 'gemma-4-e4b-gpu'))).toBe(false)
  })

  it('says what a refused gated download needs and leaves no partial model', async () => {
    const { s, modelsDir } = setups({ gated: true, token: 'hf_wrong' })
    hub.files.set(`/${REPO}/resolve/${REV}/gemma-4-E4B-it-gpu.litertlm`, {
      body: GPU,
      failStatus: 403,
      failTimes: 99,
    })
    const plan = await s.plan({ model: 'gemma-4-e4b' })
    await s.install({ request_id: 'r1', plan_digest: plan.digest })
    const job = await settle(s, 'r1')
    expect(job.stage).toBe('failed')
    expect(job.error).toContain('HF_TOKEN')
    expect(job.error).toContain(`https://huggingface.co/${REPO}`)
    expect(existsSync(join(modelsDir, 'gemma-4-e4b-gpu'))).toBe(false)
  })

  it('sends HF_TOKEN to the Hub and not to the CDN its link redirects to', async () => {
    const { s } = setups({ token: 'hf_secret' })
    cdn.files.set('/cas/gpu', { body: GPU })
    hub.files.set(`/${REPO}/resolve/${REV}/gemma-4-E4B-it-gpu.litertlm`, {
      body: Buffer.alloc(0),
      redirect: `${cdnBase}/cas/gpu`,
    })
    const plan = await s.plan({ model: 'gemma-4-e4b' })
    await s.install({ request_id: 'r1', plan_digest: plan.digest })
    expect((await settle(s, 'r1')).stage).toBe('ready')
    expect(
      hub.requests
        .filter((r) => r.path.includes('/resolve/'))
        .every((r) => r.authorization === 'Bearer hf_secret')
    ).toBe(true)
    expect(cdn.requests.length).toBeGreaterThan(0)
    expect(cdn.requests.every((r) => r.authorization === undefined)).toBe(true)
  })
})
