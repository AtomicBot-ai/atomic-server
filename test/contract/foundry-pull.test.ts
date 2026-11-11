/** `atc models pull … --engine foundry-local` (spec foundry-local-server) against a server's workspace. */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import type { FoundryModelJob, FoundryModelPlan } from '../../src/contract/index.js'
import { writeDocument } from '../../src/terminal-data/index.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { confList, foundryCheck, serveAzure, WEIGHTS } from '../helpers/foundry-azure.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { waitFor } from '../helpers/wait-for.js'
import { workspaceServer } from '../helpers/workspace-server.js'

const azure = new FixtureHttpServer()
const scratch = mkdtempSync(join(tmpdir(), 'atc-fpull-'))
let base = ''
beforeAll(async () => {
  base = await azure.start()
})
afterAll(async () => {
  azure.release()
  await azure.stop()
  rmSync(scratch, { recursive: true, force: true })
})

let t: TestRun
let close: (() => Promise<void>) | undefined
afterEach(async () => {
  await close?.()
  t?.cleanup()
})
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')

/** A server whose core registers Foundry Local and judges each device by `verdicts`. */
async function server(
  verdicts: Record<string, string> = {},
  host: { platform: NodeJS.Platform; arch: string } = { platform: 'linux', arch: 'x64' }
) {
  azure.reset()
  serveAzure(azure, base, 'openvino-npu', '1')
  serveAzure(azure, base, 'generic-cpu', '1')
  t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  t.link.responses['POST /engines/versions'] = { engines: [{ engine: 'foundry-local' }] }
  t.link.responses['POST /models/foundry-local/check'] = foundryCheck(verdicts)
  const url = confList(join(scratch, `${Math.random().toString(36).slice(2)}.json`), base)
  // A named machine, not the runner's: conf's list has no variant for every runner (win-arm64).
  const start = async () => {
    const ws = await workspaceServer(t.link, paths, { ATC_FOUNDRY_LOCAL_MODELS_URL: url }, undefined, host)
    close = ws.close
    return ws.service
  }
  const service = await start()
  return {
    models: join(paths.dataFolder, 'foundry-local', 'models'),
    atcDir: paths.atcDir,
    service,
    restart: async () => {
      await close?.()
      return start()
    },
  }
}

describe('atc models pull --engine foundry-local', () => {
  // On an arm64 runner (this one's process) only the server's machine, win32/x64, names conf's win-x64 variants.
  it('reads the variants for the server’s machine, not the process’s own architecture', async () => {
    await server({}, { platform: 'win32', arch: 'x64' })
    expect(await t.run(['models', 'search', 'gemma', '--engine', 'foundry-local', '--json']), err()).toBe(0)
    const found = JSON.parse(out()) as { models: { variants: unknown[] }[] }
    expect(found.models[0]?.variants.length).toBeGreaterThan(0)
  })

  it('downloads the default variant (NPU first) and follows it to ready', async () => {
    const { models } = await server()
    expect(await t.run(['models', 'pull', 'gemma-4-e2b-it', '--engine', 'foundry-local'])).toBe(0)
    expect(out()).toContain('gemma-4-e2b-it-openvino-npu (OpenVINO NPU)')
    expect(out()).toContain('atc run gemma-4-e2b-it-openvino-npu --engine foundry-local')
    expect(existsSync(join(models, 'gemma-4-e2b-it-openvino-npu', 'model.yml'))).toBe(true)
  })

  it('takes the variant for --device, and prints the plan only with --dry-run', async () => {
    const { models } = await server()
    const args = ['models', 'pull', 'gemma-4-e2b-it', '--engine', 'foundry-local', '--device', 'cpu']
    expect(await t.run([...args, '--dry-run', '--json'])).toBe(0)
    expect(JSON.parse(out())).toMatchObject({ variant_id: 'gemma-4-e2b-it-generic-cpu', device: 'cpu' })
    expect(existsSync(join(models, 'gemma-4-e2b-it-generic-cpu'))).toBe(false)
  })

  it('says how to install the engine, and downloads nothing, while it is not installed', async () => {
    await server({ npu: 'engine-not-installed', cpu: 'engine-not-installed' })
    const args = ['models', 'pull', 'gemma-4-e2b-it-generic-cpu', '--engine', 'foundry-local']
    expect(await t.run(args)).toBe(2)
    expect(err()).toContain('atc engines install foundry-local')
    expect(azure.requests.filter((r) => r.path.startsWith('/container'))).toEqual([])
  })

  it.each([
    ['v2.10.0', 'atc engines install foundry-local'],
    ['v2.3.0', 'No compatible Foundry Local update is available for this host.'],
  ])('explains the runtime minimum before transferring weights when latest is %s', async (latest, action) => {
    await server()
    serveAzure(azure, base, 'generic-cpu', '1', '2.4.0')
    t.link.responses['POST /engines/versions'] = {
      engines: [{ engine: 'foundry-local', latest: { version: latest } }],
    }
    t.link.responses['POST /models/foundry-local/check'] = (body: unknown) =>
      (body as { min_runtime_version?: string }).min_runtime_version === '2.4.0'
        ? {
            verdict: 'engine-update-required',
            reason: 'Foundry Local 2.1.0 is active; this model requires 2.4.0 or newer.',
            accelerator: null,
          }
        : foundryCheck()(body)
    expect(
      await t.run(['models', 'pull', 'gemma-4-e2b-it-generic-cpu', '--engine', 'foundry-local']),
      err()
    ).toBe(2)
    expect(err()).toContain('Foundry Local 2.1.0 is active; this model requires 2.4.0 or newer.')
    expect(err()).toContain(action)
    expect(azure.requests.filter((r) => r.path.startsWith('/container'))).toEqual([])
  })

  it('preserves a partial from an old job when blocked and resumes the same revision under a fresh link', async () => {
    const { service, atcDir, restart } = await server()
    const plan = (await service.execute('foundry.plan', {
      model: 'gemma-4-e2b-it',
      device: 'cpu',
    })) as FoundryModelPlan
    const journal = join(atcDir, 'foundry-model-setups', 'old.json')
    const settled = async () => {
      let job: FoundryModelJob
      await waitFor(async () => {
        job = JSON.parse(await readFile(journal, 'utf8')) as FoundryModelJob
        return job.stage === 'ready' || job.stage === 'failed'
      })
      return job!
    }
    const weights = join(plan.dir, 'model.onnx')
    const partial = WEIGHTS.subarray(0, 200_000)
    await mkdir(plan.dir, { recursive: true })
    await writeFile(`${weights}.tmp`, partial)
    await writeFile(`${weights}.url`, 'foundry-local/gemma-4-e2b-it-generic-cpu/model.onnx')
    await writeDocument(journal, {
      id: 'old',
      kind: 'foundry-model',
      plan,
      stage: 'downloading',
      updated_at: 1,
    })
    serveAzure(azure, base, 'generic-cpu', '2', '2.4.0')
    t.link.responses['POST /models/foundry-local/check'] = (body: unknown) =>
      (body as { min_runtime_version?: string }).min_runtime_version === '2.4.0'
        ? { verdict: 'engine-update-required', reason: 'Requires Foundry Local 2.4.0.', accelerator: null }
        : foundryCheck()(body)
    const input = { request_id: 'old', plan_digest: plan.digest }
    await service.execute('foundry.install', input)
    expect(await settled()).toMatchObject({
      stage: 'failed',
      error: expect.stringContaining('2.4.0'),
    })
    expect(await readFile(`${weights}.tmp`)).toEqual(partial)
    expect(azure.requests.filter((r) => r.path.startsWith('/container'))).toEqual([])

    // The resolver omits its minimum on retry. Keep the requirement discovered in the previous run.
    serveAzure(azure, base, 'generic-cpu', '3')
    const restarted = await restart()
    await restarted.execute('foundry.install', input)
    expect((await settled()).stage).toBe('failed')
    t.link.responses['POST /models/foundry-local/check'] = foundryCheck()
    await restarted.execute('foundry.install', input)
    expect(await settled()).toMatchObject({
      stage: 'ready',
      plan: { asset_id: plan.asset_id, version: '3' },
    })
    expect(azure.requests.find((r) => r.path === '/container/v3/model.onnx?sig=3')?.range).toBe(
      'bytes=200000-'
    )
    expect(await readFile(weights)).toEqual(WEIGHTS)
  })

  it('starts with --detach and stops with --cancel', async () => {
    await server()
    azure.files.get('/container/v3/model.onnx?sig=1')!.holdAfterBytes = 200_000
    const args = ['models', 'pull', 'gemma-4-e2b-it', '--engine', 'foundry-local']
    expect(await t.run([...args, '--detach', '--request-id', 'fl-1'])).toBe(0)
    expect(out()).toContain('atc models pull --cancel fl-1 --engine foundry-local')
    t.io.out.length = 0
    expect(await t.run(['models', 'pull', '--cancel', 'fl-1', '--engine', 'foundry-local'])).toBe(0)
    expect(out()).toContain('cancelled')
    azure.release()
  })
})
