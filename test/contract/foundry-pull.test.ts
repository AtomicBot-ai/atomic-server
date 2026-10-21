/** `atc models pull … --engine foundry-local` (spec foundry-local-server) against a server's workspace. */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { confList, foundryCheck, serveAzure } from '../helpers/foundry-azure.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
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
async function server(verdicts: Record<string, string> = {}) {
  azure.reset()
  serveAzure(azure, base, 'openvino-npu', '1')
  serveAzure(azure, base, 'generic-cpu', '1')
  t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  t.link.responses['POST /engines/versions'] = { engines: [{ engine: 'foundry-local' }] }
  t.link.responses['POST /models/foundry-local/check'] = foundryCheck(verdicts)
  const url = confList(join(scratch, `${Math.random().toString(36).slice(2)}.json`), base)
  const ws = await workspaceServer(t.link, paths, { ATC_FOUNDRY_LOCAL_MODELS_URL: url })
  close = ws.close
  return join(paths.dataFolder, 'foundry-local', 'models')
}

describe('atc models pull --engine foundry-local', () => {
  it('downloads the default variant (NPU first) and follows it to ready', async () => {
    const models = await server()
    expect(await t.run(['models', 'pull', 'gemma-4-e2b-it', '--engine', 'foundry-local'])).toBe(0)
    expect(out()).toContain('gemma-4-e2b-it-openvino-npu (OpenVINO NPU)')
    expect(out()).toContain('atc run gemma-4-e2b-it-openvino-npu --engine foundry-local')
    expect(existsSync(join(models, 'gemma-4-e2b-it-openvino-npu', 'model.yml'))).toBe(true)
  })

  it('takes the variant for --device, and prints the plan only with --dry-run', async () => {
    const models = await server()
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
