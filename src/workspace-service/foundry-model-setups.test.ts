import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseModelYml } from '@atomic-chat/core/models'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Downloader } from '../downloads/index.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { ASSET, confList, foundryCheck, serveAzure, WEIGHTS } from '../../test/helpers/foundry-azure.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import type { FoundryModelJob } from '../contract/index.js'
import { FoundryModelSetups } from './foundry-model-setups.js'

const azure = new FixtureHttpServer()
const scratch = mkdtempSync(join(tmpdir(), 'atc-fms-'))
let base = ''
let n = 0
beforeAll(async () => {
  base = await azure.start()
})
afterAll(async () => {
  azure.release()
  await azure.stop()
  rmSync(scratch, { recursive: true, force: true })
})
beforeEach(() => {
  azure.reset()
  n += 1
})

const confFor = () => confList(join(scratch, `list-${n}.json`), base)
const serve = (id: string, sig: string) => serveAzure(azure, base, id, sig)

function core(verdicts: Record<string, string> = {}) {
  const l = fakeCoreLink()
  l.responses['POST /engines/versions'] = { engines: [{ engine: 'foundry-local' }] }
  l.responses['POST /models/foundry-local/check'] = foundryCheck(verdicts)
  return l
}

function setups(l = core(), url = confFor()) {
  const data = join(scratch, `data-${n}`)
  return {
    data,
    s: new FoundryModelSetups({
      link: l,
      fetch,
      list: { cachePath: join(data, 'atc', 'cache', 'foundry-local-models.json'), url },
      platform: 'win32',
      arch: 'x64',
      modelsDir: join(data, 'foundry-local', 'models'),
      directory: join(data, 'atc', 'foundry-model-setups'),
      downloader: new Downloader({
        dataFolder: data,
        platform: process.platform,
        fetch,
        streams: 1,
        availableSpace: async () => undefined,
        sleep: async () => {},
      }),
    }),
  }
}
const settled = async (s: FoundryModelSetups, id: string): Promise<FoundryModelJob> => {
  let job: FoundryModelJob | undefined
  await waitFor(async () => {
    job = (await s.list()).find((j) => j.id === id)
    return !!job && ['ready', 'failed', 'cancelled'].includes(job.stage)
  })
  return job!
}

describe('FoundryModelSetups', () => {
  it('downloads the NPU variant into its folder, model.yml last with the foundry_local block', async () => {
    serve('openvino-npu', '1')
    const { s, data } = setups()
    const plan = await s.plan({ model: 'gemma-4-e2b-it' })
    expect(plan).toMatchObject({ variant_id: 'gemma-4-e2b-it-openvino-npu', device: 'npu', blockers: [] })
    expect(
      (await settled(s, (await s.install({ request_id: 'f1', plan_digest: plan.digest })).id)).stage
    ).toBe('ready')
    const dir = join(data, 'foundry-local', 'models', 'gemma-4-e2b-it-openvino-npu')
    expect((await readdir(dir)).sort()).toEqual(['chat_template.jinja', 'model.onnx', 'model.yml'])
    const yml = parseModelYml(await readFile(join(dir, 'model.yml'), 'utf8'))
    expect(yml).toMatchObject({
      model_path: 'foundry-local/models/gemma-4-e2b-it-openvino-npu',
      name: 'Gemma 4 E2B (OpenVINO NPU)',
      foundry_local: {
        model_id: 'gemma-4-e2b-it',
        variant_id: 'gemma-4-e2b-it-openvino-npu',
        execution_provider: 'openvino',
        device: 'npu',
        asset_id: ASSET('openvino-npu'),
        asset_version: '3',
        context_length: 32768,
        tools: true,
        reasoning: false,
      },
    })
    const [template, record] = await Promise.all(
      ['chat_template.jinja', 'model.yml'].map((f) => stat(join(dir, f)))
    )
    expect(record!.mtimeMs).toBeGreaterThanOrEqual(template!.mtimeMs)
  })

  it('resolves again on an expired link and continues from where it stopped', async () => {
    serve('generic-cpu', '1')
    const { s } = setups()
    const plan = await s.plan({ model: 'gemma-4-e2b-it', device: 'cpu' })
    azure.files.get('/container/v3/model.onnx?sig=1')!.holdAfterBytes = 200_000
    await s.install({ request_id: 'f2', plan_digest: plan.digest })
    await waitFor(() => (azure.sent.get('/container/v3/model.onnx?sig=1') ?? 0) >= 200_000)
    // The link expires: what it served stops, it answers 403, and the resolver names a new one.
    azure.files.set('/container/v3/model.onnx?sig=1', { body: WEIGHTS, failStatus: 403, failTimes: 99 })
    serve('generic-cpu', '2')
    azure.cut()
    const job = await settled(s, 'f2')
    expect(job.stage).toBe('ready')
    expect(job.relinks).toBe(1)
    expect(azure.requests.find((r) => r.path === '/container/v3/model.onnx?sig=2')?.range).toMatch(
      /^bytes=[1-9]\d*-$/
    )
  })

  it('repairs a template with the function wrapper once', async () => {
    serve('generic-cpu', '1')
    const { s, data } = setups()
    const plan = await s.plan({ model: 'gemma-4-e2b-it-generic-cpu' })
    await settled(s, (await s.install({ request_id: 'f3', plan_digest: plan.digest })).id)
    const template = await readFile(
      join(data, 'foundry-local', 'models', 'gemma-4-e2b-it-generic-cpu', 'chat_template.jinja'),
      'utf8'
    )
    expect(template).toContain("(tool_call['function'] if tool_call['function'] else tool_call)")
    expect(template.match(/atomic-chat: Foundry Local/g)).toHaveLength(1)
  })

  it('downloads nothing while the engine is not installed, and says how to install it', async () => {
    serve('generic-cpu', '1')
    const { s } = setups(core({ npu: 'engine-not-installed', cpu: 'engine-not-installed' }))
    await expect(s.plan({ model: 'gemma-4-e2b-it' })).rejects.toThrow('no variant')
    const plan = await s.plan({ model: 'gemma-4-e2b-it-generic-cpu' })
    expect(plan.blockers[0]).toContain('atc engines install foundry-local')
    await expect(s.install({ request_id: 'f4', plan_digest: plan.digest })).rejects.toThrow(
      'atc engines install foundry-local'
    )
    expect(azure.requests.filter((r) => r.path.startsWith('/container'))).toEqual([])
  })
})
