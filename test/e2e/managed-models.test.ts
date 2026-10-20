/**
 * Managed-engine models through the built `atc` (task 4.7): on the core's fake Linux machine, with
 * Hugging Face served on loopback (`HF_ENDPOINT`), `atc models pull --engine vllm` downloads a
 * checkpoint into the shared store, survives a server restart mid-download and continues with the same
 * request id; the model is then listed by the managed providers, and removed through the core.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'
import { fakeManagedMachine } from '../helpers/fake-managed-machine.js'
import type { FakeManagedMachine } from '../helpers/fake-managed-machine.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { HF_SHA, qwenFiles, safetensors, serveRepository } from '../helpers/hf-hub.js'
import { waitFor } from '../helpers/wait-for.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-mm-'))
const dataFolder = join(scratch, 'data')
const hf = new FixtureHttpServer()
const REPO = 'Qwen/Qwen3.5-2B'
const SHARD = `/${REPO}/resolve/${HF_SHA}/model-00001-of-00002.safetensors`
/** What a real Qwen3 checkpoint's config.json says that the core's check reads. */
const QWEN_CONFIG = {
  torch_dtype: 'bfloat16',
  num_hidden_layers: 28,
  num_attention_heads: 16,
  num_key_value_heads: 8,
  head_dim: 128,
  hidden_size: 2048,
  max_position_embeddings: 40960,
}
let machine: FakeManagedMachine
let env: NodeJS.ProcessEnv

/** Never `spawnSync`: the fake conf, Docker API and Hub are servers in this process. */
function atc(...rest: string[]): Promise<{ code: number | null; out: string; err: string }> {
  const child = spawn(ATC[0] as string, [...ATC.slice(1), ...rest, '--data-folder', dataFolder], { env })
  let out = ''
  let err = ''
  child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
  return new Promise((resolve) => child.on('exit', (code) => resolve({ code, out, err })))
}
const json = async (...rest: string[]) => {
  const res = await atc(...rest, '--json')
  if (res.code !== 0) throw new Error(`atc ${rest.join(' ')}: ${res.err}`)
  return JSON.parse(res.out) as Record<string, unknown>
}
const installed = async () =>
  ((await json('models', 'list')) as { result: Array<{ id: string; providers?: string[] }> }).result

beforeAll(async () => {
  if (process.platform === 'win32') return
  machine = await fakeManagedMachine()
  const hub = await hf.start()
  // A shard larger than the header probe, so its header is read and its download can be held.
  serveRepository(hf, REPO, {
    ...qwenFiles(QWEN_CONFIG),
    'model-00001-of-00002.safetensors': safetensors(['model.layers.0.self_attn.q_proj.weight'], 600_000),
  })
  env = {
    ...process.env,
    NO_COLOR: '1',
    ...machine.env,
    ATOMIC_CORE_MANAGED_ROOT: join(scratch, 'managed'),
    HF_ENDPOINT: hub,
  }
  if ((await atc('start', '--admin-port', '0')).code !== 0) throw new Error('atc start failed')
  const setup = await atc('engines', 'install', 'vllm', '--yes')
  if (setup.code !== 0) throw new Error(`vllm setup failed: ${setup.err}`)
})

afterAll(async () => {
  if (process.platform === 'win32') return
  await atc('stop', '--force', '--kill')
  hf.release()
  await hf.stop()
  await machine.close()
  rmSync(machine.dir, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')(`managed models (${ATC.join(' ')})`, () => {
  it('continues a download a server restart interrupted, then the providers list the model', async () => {
    hf.files.get(SHARD)!.holdAfterBytes = 300_000
    const started = await atc(
      'models',
      'pull',
      REPO,
      '--engine',
      'vllm',
      '--detach',
      '--request-id',
      'e2e-pull'
    )
    expect(started.code, started.err).toBe(0)
    await waitFor(() => (hf.sent.get(SHARD) ?? 0) >= 300_000, 20_000)
    // A restart of the server (on a free admin port: 1338 may be another atc's).
    expect((await atc('stop', '--force')).code).toBe(0)
    expect((await atc('start', '--admin-port', '0')).code).toBe(0)
    const jobs = (await json('control', 'call', 'managed.list')) as {
      result: Array<{ id: string; stage: string; plan: { root: string } }>
    }
    const job = jobs.result.find((j) => j.id === 'e2e-pull')!
    expect(job.stage).toBe('interrupted')
    expect(existsSync(join(job.plan.root, 'Qwen', 'Qwen3.5-2B', 'model.yml'))).toBe(false)
    hf.release()
    delete hf.files.get(SHARD)!.holdAfterBytes
    hf.requests.length = 0
    const resumed = await atc('models', 'pull', REPO, '--engine', 'vllm', '--request-id', 'e2e-pull')
    expect(resumed.code, resumed.err).toBe(0)
    expect(resumed.out).toContain('in the store for every managed engine')
    expect(hf.requests.find((r) => r.path === SHARD && r.range?.match(/^bytes=[1-9]\d*-$/))).toBeDefined()
    expect(existsSync(join(job.plan.root, 'Qwen', 'Qwen3.5-2B', 'model.yml'))).toBe(true)
    const row = (await installed()).find((m) => m.id === REPO)
    expect(row?.providers).toEqual(expect.arrayContaining(['vllm', 'tensorrt-llm']))
  })

  it('removes the model through the core', async () => {
    const res = await atc('models', 'rm', REPO, '--yes')
    expect(res.code, res.err).toBe(0)
    expect(res.err).toContain('every managed engine')
    expect((await installed()).some((m) => m.id === REPO)).toBe(false)
  })
})
