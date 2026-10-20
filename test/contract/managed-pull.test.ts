/** `atc models pull … --engine <managed>` (spec managed-models-server) against a server's workspace. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { HF_SHA, qwenFiles, safetensors, serveRepository } from '../helpers/hf-hub.js'
import { environment, installation } from '../helpers/managed-fixtures.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { workspaceServer } from '../helpers/workspace-server.js'

const hf = new FixtureHttpServer()
let hub = ''
beforeAll(async () => {
  hub = await hf.start()
})
afterAll(async () => {
  hf.release()
  await hf.stop()
})

let t: TestRun
let close: (() => Promise<void>) | undefined
afterEach(async () => {
  await close?.()
  t?.cleanup()
})
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')

const REPO = 'Qwen/Qwen3.5-2B'
const ok = {
  architectures: ['Qwen3ForCausalLM'],
  quantization_format: null,
  weight_bytes: 6144,
  checked_gpu_id: 'GPU-0',
  curated: false,
  unified_memory: false,
  fits_other_gpus: [],
  verdict: { ok: true },
}
const refused = (message: string) => ({
  ...ok,
  verdict: { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message } },
})

/** A server with vLLM and TensorRT-LLM registered, `installed` installed, and its store under the data folder. */
async function server(installed = ['vllm']) {
  hf.reset()
  serveRepository(hf, REPO, qwenFiles())
  t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  const root = join(paths.dataFolder, 'managed-models')
  t.link.responses['POST /engines/versions'] = {
    engines: [{ engine: 'llamacpp-upstream' }, { engine: 'tensorrt-llm' }, { engine: 'vllm' }],
  }
  t.link.responses['GET /environments'] = {
    environments: [environment({ installations: installed.map((e) => installation(e)) })],
  }
  t.link.responses['POST /models/vllm/check'] = ok
  t.link.responses['POST /models/tensorrt-llm/check'] = refused('AutoAWQ is not a format this release runs.')
  t.link.responses['GET /managed-models/location'] = { root, free_bytes: 10 * 1024 ** 3 }
  t.link.responses[`GET /models/vllm/${REPO}/capabilities`] = { model_id: REPO }
  const ws = await workspaceServer(t.link, paths, { HF_ENDPOINT: hub }, hub)
  close = ws.close
  return { root, dir: join(root, 'Qwen', 'Qwen3.5-2B') }
}

describe('atc models pull --engine <managed>', () => {
  it('prints the plan, downloads the revision into the store and follows it to ready', async () => {
    const { dir } = await server()
    expect(await t.run(['models', 'pull', REPO, '--engine', 'vllm'])).toBe(0)
    expect(out()).toContain(HF_SHA)
    expect(out()).toMatch(/vllm \(installed\): ok/)
    expect(out()).toContain(`${REPO} is in the store`)
    expect(existsSync(join(dir, 'model.yml'))).toBe(true)
  })

  it('prints the plan only with --dry-run', async () => {
    const { dir } = await server()
    expect(await t.run(['models', 'pull', REPO, '--engine', 'vllm', '--dry-run', '--json'])).toBe(0)
    const plan = JSON.parse(out()) as { revision: string; pending: string[]; verdict: { engine: string } }
    expect(plan).toMatchObject({ revision: HF_SHA, verdict: { engine: 'vllm' } })
    expect(plan.pending).toHaveLength(4)
    expect(existsSync(dir)).toBe(false)
  })

  it('prints the refusal with its reason and downloads nothing', async () => {
    const { dir } = await server()
    expect(await t.run(['models', 'pull', REPO, '--engine', 'tensorrt-llm'])).toBe(1)
    expect(out()).toContain('AutoAWQ is not a format this release runs.')
    expect(err()).toContain('MODEL_INCOMPATIBLE')
    expect(existsSync(dir)).toBe(false)
  })

  it('names the managed engines that take a repository without GGUF, and downloads nothing', async () => {
    const { dir } = await server()
    expect(await t.run(['models', 'pull', REPO])).toBe(2)
    expect(err()).toContain(`atc models pull ${REPO} --engine vllm`)
    expect(err()).not.toContain('--engine tensorrt-llm')
    expect(existsSync(dir)).toBe(false)
  })

  it('starts with --detach and stops with --cancel, keeping what was downloaded', async () => {
    await server()
    // Bigger than the header probe (256 KiB), so the plan reads its header and the download is held.
    const shard = safetensors(['model.layers.0.self_attn.q_proj.weight'], 600_000)
    serveRepository(hf, REPO, { ...qwenFiles(), 'model-00001-of-00002.safetensors': shard })
    hf.files.get(`/${REPO}/resolve/${HF_SHA}/model-00001-of-00002.safetensors`)!.holdAfterBytes = 300_000
    expect(
      await t.run(['models', 'pull', REPO, '--engine', 'vllm', '--detach', '--request-id', 'pull-1'])
    ).toBe(0)
    expect(out()).toContain('atc models pull --cancel pull-1')
    t.io.out.length = 0
    expect(await t.run(['models', 'pull', '--cancel', 'pull-1'])).toBe(0)
    expect(out()).toContain('cancelled')
    hf.release()
  })
})
