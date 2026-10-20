/** `atc run --engine <managed>` and `atc models logs` (spec managed-models-server, "Запуск модели managed-движка"). */
import { AtomicCoreError } from '@atomic-chat/core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { environment, installation } from '../helpers/managed-fixtures.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { waitFor } from '../helpers/wait-for.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')
const REPO = 'Qwen/Qwen3.5-2B'

const stage = (provider: string, stage: string, elapsed_ms: number) =>
  t.link.emit({
    id: `x:${elapsed_ms}`,
    event: 'session:load-progress',
    data: { provider, model_id: REPO, generation: 'g1', stage, elapsed_ms },
  })

/** A core whose load of `REPO` on `provider` goes through its stages, then answers or fails. */
function host(over: Parameters<typeof testRun>[0] = {}, fail?: AtomicCoreError) {
  t = testRun(over)
  t.link.responses['POST /engines/versions'] = {
    engines: [{ engine: 'llamacpp-upstream' }, { engine: 'vllm' }, { engine: 'tensorrt-llm' }],
  }
  t.link.models.load = async (provider, modelId) => {
    t.link.calls.push({ method: 'POST', path: `/models/${provider}/${modelId}/load` })
    await new Promise((r) => setTimeout(r, 10))
    stage('sglang', 'starting-container', 1) // another provider's load: not this one's
    stage(provider, 'stopping-previous', 300)
    stage(provider, 'starting-container', 2_100)
    stage(provider, 'initializing-engine', 41_000)
    await new Promise((r) => setTimeout(r, 10))
    if (fail) throw fail
    stage(provider, 'ready', 63_000)
    return {
      pid: 0,
      port: 8000,
      model_id: modelId,
      model_path: '',
      is_embedding: false,
      api_key: '',
    } as never
  }
}

describe('atc run --engine <managed>', () => {
  it('shows the stages of this load with their elapsed time', async () => {
    host()
    expect(await t.run(['run', REPO, '--engine', 'vllm'])).toBe(0)
    expect(err()).toContain('Stopping the previous model')
    expect(err()).toMatch(/Starting the container.*2s/)
    expect(err()).toMatch(/Initializing the engine.*41s/)
    expect(err()).not.toContain('sglang')
  })

  it('writes each stage as one NDJSON line with --json', async () => {
    host()
    expect(await t.run(['run', REPO, '--engine', 'vllm', '--json'])).toBe(0)
    const lines = out()
      .trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.filter((l) => l['load']).map((l) => (l['load'] as { stage: string }).stage)).toEqual([
      'stopping-previous',
      'starting-container',
      'initializing-engine',
      'ready',
    ])
  })

  it('prints the error and the tail of the last attempt’s log when the load fails', async () => {
    host({}, new AtomicCoreError('MODEL_LOAD_FAILED', 'The container exited during initialization.'))
    t.link.responses[`GET /models/tensorrt-llm/${REPO}/logs`] = 'line 1\nline 2\nCUDA error: out of memory\n'
    expect(await t.run(['run', REPO, '--engine', 'tensorrt-llm'])).toBe(1)
    expect(err()).toContain('The container exited during initialization.')
    expect(err()).toContain('CUDA error: out of memory')
  })

  it('cancels the load on Ctrl-C', async () => {
    let interrupt: (() => void) | undefined
    host({ io: { onInterrupt: (h) => ((interrupt = h), () => (interrupt = undefined)) } })
    let cancelled = ''
    t.link.models.cancelLoad = async (provider, modelId) => ((cancelled = `${provider} ${modelId}`), true)
    const load = t.link.models.load
    t.link.models.load = async (provider, modelId) => {
      await waitFor(() => cancelled !== '')
      return load(provider, modelId)
    }
    const running = t.run(['run', REPO, '--engine', 'vllm'])
    await waitFor(() => interrupt !== undefined)
    interrupt!()
    expect(await running).toBe(130)
    expect(cancelled).toBe(`vllm ${REPO}`)
  })

  it('asks for --engine when several installed engines list a store model and the default is not one of them', async () => {
    host()
    const root = join(t.io.env['ATC_DATA_FOLDER'] as string, 'managed-models')
    mkdirSync(join(root, 'Qwen', 'Qwen3.5-2B'), { recursive: true })
    writeFileSync(join(root, 'Qwen', 'Qwen3.5-2B', 'model.yml'), '{}')
    t.link.responses['GET /managed-models/location'] = { root, free_bytes: null }
    t.link.responses['GET /environments'] = {
      environments: [environment({ installations: [installation('vllm'), installation('tensorrt-llm')] })],
    }
    for (const engine of ['vllm', 'tensorrt-llm'])
      t.link.responses[`GET /models/${engine}/${REPO}/capabilities`] = { model_id: REPO }
    expect(await t.run(['run', REPO])).toBe(2)
    expect(err()).toContain('--engine')
    expect(err()).toMatch(/vllm, tensorrt-llm|tensorrt-llm, vllm/)
    expect(t.link.calls.some((c) => c.path.endsWith('/load'))).toBe(false)
  })

  it('loads a store model with the one installed engine that lists it', async () => {
    host()
    const root = join(t.io.env['ATC_DATA_FOLDER'] as string, 'managed-models')
    mkdirSync(join(root, 'Qwen', 'Qwen3.5-2B'), { recursive: true })
    writeFileSync(join(root, 'Qwen', 'Qwen3.5-2B', 'model.yml'), '{}')
    t.link.responses['GET /managed-models/location'] = { root, free_bytes: null }
    t.link.responses['GET /environments'] = {
      environments: [environment({ installations: [installation('vllm')] })],
    }
    for (const engine of ['vllm', 'tensorrt-llm'])
      t.link.responses[`GET /models/${engine}/${REPO}/capabilities`] = { model_id: REPO }
    expect(await t.run(['run', REPO])).toBe(0)
    expect(t.link.calls.find((c) => c.path.endsWith('/load'))?.path).toBe(`/models/vllm/${REPO}/load`)
  })
})

describe('atc models logs', () => {
  it('prints the tail of the loaded model’s or last failed load’s log', async () => {
    host()
    t.link.responses[`GET /models/vllm/${REPO}/logs`] = 'INFO started\nINFO ready\n'
    expect(await t.run(['models', 'logs', REPO, '--engine', 'vllm'])).toBe(0)
    expect(out()).toContain('INFO ready')
  })
})
