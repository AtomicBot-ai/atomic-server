/**
 * Managed-engine models through the built `atc` (task 4.7): on the core's fake Linux machine, with
 * Hugging Face served on loopback (`HF_ENDPOINT`), `atc models pull --engine vllm` downloads a
 * checkpoint into the shared store, survives a server restart mid-download and continues with the same
 * request id; the model is then listed by the managed providers, and removed through the core.
 */
import { spawn } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
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

/**
 * Loading a store model and chatting with it (task 5.3), on the core's model-running fakes: `docker`
 * runs `fake-vllm-engine.mjs` for a `vllm serve` container and `nvidia-smi` reports one card. vLLM's
 * installation is written where a setup leaves it (its record and pinned descriptor), as in the core's
 * own `vllm-provider` e2e.
 */
describe.skipIf(process.platform === 'win32')(`a managed load (${ATC.join(' ')})`, () => {
  const scratch2 = mkdtempSync(join(tmpdir(), 'atc-e2e-load-'))
  const data2 = join(scratch2, 'data')
  const root2 = join(scratch2, 'managed')
  const host2 = join(scratch2, 'host')
  const KEY = `atc_${'5'.repeat(64)}`
  let env2: NodeJS.ProcessEnv
  const run2 = (...rest: string[]) => {
    const child = spawn(ATC[0] as string, [...ATC.slice(1), ...rest, '--data-folder', data2], { env: env2 })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
    return new Promise<{ code: number | null; out: string; err: string }>((resolve) =>
      child.on('exit', (code) => resolve({ code, out, err }))
    )
  }
  const helper = (name: string) => fileURLToPath(new URL(`../helpers/${name}`, import.meta.url))
  const wrap = (path: string, script: string, vars: Record<string, string> = {}) => {
    const exports = Object.entries(vars)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v)}\n`)
      .join('')
    writeFileSync(
      path,
      `#!/bin/sh\n${exports}exec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`
    )
    chmodSync(path, 0o755)
  }

  beforeAll(async () => {
    if (process.platform === 'win32') return
    mkdirSync(join(host2, 'bin'), { recursive: true })
    wrap(join(host2, 'bin', 'docker'), helper('fake-model-docker.mjs'), {
      FAKE_DOCKER_STATE: join(host2, 'docker.json'),
    })
    wrap(join(host2, 'bin', 'nvidia-smi'), helper('fake-nvidia-smi.mjs'))
    const descriptor = JSON.parse(readFileSync(helper('../fixtures/managed/runtimes/vllm.json'), 'utf8')) as {
      descriptor_id: string
      image: Record<string, unknown>
    }
    mkdirSync(join(root2, 'descriptors'), { recursive: true })
    copyFileSync(
      helper('../fixtures/managed/runtimes/vllm.json'),
      join(root2, 'descriptors', `${descriptor.descriptor_id}.json`)
    )
    mkdirSync(join(root2, 'installations', 'vllm'), { recursive: true })
    const platform = process.arch === 'arm64' ? 'linux/arm64' : 'linux/amd64'
    writeFileSync(
      join(root2, 'installations', 'vllm', 'installation.json'),
      JSON.stringify({
        schema_version: 1,
        installation: {
          installation_id: 'vllm',
          engine_id: 'vllm',
          environment_id: 'default',
          active_descriptor_id: descriptor.descriptor_id,
          candidate_descriptor_id: null,
          availability: 'supported',
          status: 'ready',
        },
        image: descriptor.image[platform],
        platform,
        installed_at: '2026-10-20T00:00:00.000Z',
      })
    )
    const model = join(data2, 'managed-models', 'qwen3')
    mkdirSync(model, { recursive: true })
    writeFileSync(
      join(model, 'config.json'),
      JSON.stringify({
        architectures: ['Qwen3ForCausalLM'],
        ...QWEN_CONFIG,
        num_hidden_layers: 4,
        hidden_size: 512,
        head_dim: 64,
      })
    )
    writeFileSync(join(model, 'model.safetensors'), Buffer.alloc(20, 1))
    writeFileSync(
      join(model, 'model.yml'),
      JSON.stringify({
        repository: 'acme/qwen3',
        revision: 'deadbeef',
        architectures: ['Qwen3ForCausalLM'],
        files: [{ path: 'model.safetensors', size: 20, sha256: null }],
      })
    )
    env2 = { ...process.env, NO_COLOR: '1', ATOMIC_CORE_MANAGED_ROOT: root2, ATOMIC_MANAGED_TEST_HOST: host2 }
    if ((await run2('start', '--admin-port', '0')).code !== 0) throw new Error('atc start failed')
  })

  afterAll(async () => {
    if (process.platform === 'win32') return
    await run2('stop', '--force', '--kill')
    rmSync(scratch2, { recursive: true, force: true })
  })

  it('shows the stages of the load, then the public API answers from the vLLM container', async () => {
    const run = await run2('run', 'qwen3', '--engine', 'vllm')
    expect(run.code, run.err).toBe(0)
    expect(run.err).toMatch(/Starting the container|Initializing the engine/)
    expect(run.out).toContain('qwen3 is running on vllm')
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const free = (probe.address() as { port: number }).port
        probe.close(() => resolve(free))
      })
    })
    const api = await run2('api', 'start', '--port', String(port), '--api-key', KEY)
    expect(api.code, api.err).toBe(0)
    const chat = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'qwen3', messages: [{ role: 'user', content: 'hi' }] }),
    })
    expect(chat.status, await chat.clone().text()).toBe(200)
    expect(
      ((await chat.json()) as { choices: { message: { content: string } }[] }).choices[0]?.message.content
    ).toBe('hello from vllm')
  })
})
