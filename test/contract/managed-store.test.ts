/** Models of the managed engines' shared store in `atc models list|rm` (spec managed-models-server). */
import { AtomicCoreError } from '@atomic-chat/core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')
const REPO = 'Qwen/Qwen3.5-2B'

/** A store with one model that vLLM and TensorRT-LLM both list. */
function store() {
  t = testRun()
  const root = join(t.io.env['ATC_DATA_FOLDER'] as string, 'managed-models')
  mkdirSync(join(root, 'Qwen', 'Qwen3.5-2B'), { recursive: true })
  writeFileSync(join(root, 'Qwen', 'Qwen3.5-2B', 'model.safetensors'), Buffer.alloc(2048))
  writeFileSync(join(root, 'Qwen', 'Qwen3.5-2B', 'model.yml'), '{}')
  t.link.responses['POST /engines/versions'] = { engines: [{ engine: 'tensorrt-llm' }, { engine: 'vllm' }] }
  t.link.responses['GET /managed-models/location'] = { root, free_bytes: null }
  for (const engine of ['tensorrt-llm', 'vllm'])
    t.link.responses[`GET /models/${engine}/${REPO}/capabilities`] = { model_id: REPO }
}

describe('the managed store in atc models', () => {
  it('lists a model of the store once, with both providers that list it', async () => {
    store()
    expect(await t.run(['models', 'list'])).toBe(0)
    const rows = out()
      .split('\n')
      .filter((l) => l.startsWith(REPO))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('vllm, tensorrt-llm')
    expect(rows[0]).toContain('2.0 KiB')
  })

  it('warns that removing it removes it for every managed engine, removes it through the core and prints the space freed', async () => {
    store()
    t.link.responses[`DELETE /managed-models/${REPO}`] = {
      model_id: REPO,
      was_loaded: true,
      freed_bytes: 3 * 1024 ** 3,
      engine_caches_removed: 2,
    }
    expect(await t.run(['models', 'rm', REPO, '--yes'])).toBe(0)
    expect(err() + out()).toContain('every managed engine (vllm, tensorrt-llm)')
    expect(out()).toContain('3.0 GiB')
    expect(t.link.calls.some((c) => c.method === 'DELETE' && c.path === `/managed-models/${REPO}`)).toBe(true)
  })

  it('says the files were not touched when the model’s container did not stop', async () => {
    store()
    t.link.responses[`DELETE /managed-models/${REPO}`] = new AtomicCoreError(
      'MANAGED_STOP_UNCONFIRMED',
      'The container did not confirm it stopped.'
    )
    expect(await t.run(['models', 'rm', REPO, '--yes'])).toBe(1)
    expect(err()).toContain('not touched')
  })
})
