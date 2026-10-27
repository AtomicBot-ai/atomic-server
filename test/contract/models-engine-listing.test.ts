/**
 * `atc models catalog|search --engine <engine>` for the engines without a list of their own (MLX, the
 * llama.cpp family): the catalog narrowed to what that engine runs, never the managed engines' reader,
 * which crashed on every such engine before 0.2.2. `atc models pull --engine mlx` plans the checkpoint
 * the web admin and the terminal UI install (`artifacts.plan`), and `atc run --engine mlx` loads an
 * installed checkpoint that was never loaded before.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ModelRegistry } from '@atomic-chat/core/models'
import { atcPathsFor } from '../../src/config/index.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { workspaceServer } from '../helpers/workspace-server.js'

const hub = new FixtureHttpServer()
let base = ''
beforeAll(async () => {
  base = await hub.start()
})
afterAll(async () => {
  hub.release()
  await hub.stop()
})

let t: TestRun
let close: (() => Promise<void>) | undefined
afterEach(async () => {
  await close?.()
  t?.cleanup()
})
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')

const GGUF = 'AtomicChat/Qwen3.8-27B-GGUF'
const MLX = 'AtomicChat/Qwen3.5-9B-MLX-4bit'
const SHA = 'a'.repeat(40)

/** A server whose core registers llama.cpp and MLX, with conf's text catalog already cached. */
async function server() {
  hub.reset()
  t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  t.link.responses['POST /engines/versions'] = {
    engines: [{ engine: 'llamacpp-upstream' }, { engine: 'mlx' }],
  }
  mkdirSync(paths.cacheDir, { recursive: true })
  writeFileSync(
    join(paths.cacheDir, 'workspace-staff-picks.json'),
    JSON.stringify({
      at: Date.now(),
      data: {
        picks: [
          { model_name: GGUF, title: 'Qwen3.8 27B', summary: 'Hybrid attention.', format: 'gguf' },
          { model_name: MLX, title: 'Qwen3.5 9B', summary: 'For Apple silicon.', format: 'mlx' },
        ],
      },
    })
  )
  hub.files.set(`/api/models/${MLX}`, { body: Buffer.from(JSON.stringify({ sha: SHA })) })
  hub.files.set(`/api/models/${MLX}/tree/${SHA}?recursive=true&expand=false&limit=1000`, {
    body: Buffer.from(
      JSON.stringify([
        { type: 'file', path: 'config.json', size: 700 },
        { type: 'file', path: 'model.safetensors', size: 5000, lfs: { oid: 'b'.repeat(64), size: 5000 } },
        { type: 'file', path: 'README.md', size: 10 },
      ])
    ),
  })
  const ws = await workspaceServer(t.link, paths, { HF_ENDPOINT: base }, base)
  close = ws.close
  return paths
}

describe('atc models catalog --engine', () => {
  it('lists only what MLX runs, and only what llama.cpp runs', async () => {
    await server()
    expect(await t.run(['models', 'catalog', '--engine', 'mlx', '--json'])).toBe(0)
    expect(JSON.parse(out()).result.rows.map((r: { id: string }) => r.id)).toEqual([MLX])
    t.io.out.length = 0
    expect(await t.run(['models', 'catalog', '--engine', 'llamacpp-upstream', '--json'])).toBe(0)
    expect(JSON.parse(out()).result.rows.map((r: { id: string }) => r.id)).toEqual([GGUF])
  })

  it('refuses an engine the core does not know', async () => {
    await server()
    expect(await t.run(['models', 'catalog', '--engine', 'bogus'])).toBe(2)
    expect(err()).toMatch(/bogus/)
    expect(err()).not.toContain('ATC_INTERNAL')
  })

  it('searches the catalog for MLX by words', async () => {
    await server()
    expect(await t.run(['models', 'search', 'apple', '--engine', 'mlx', '--json'])).toBe(0)
    expect(JSON.parse(out()).result.rows.map((r: { id: string }) => r.id)).toEqual([MLX])
    t.io.out.length = 0
    expect(await t.run(['models', 'search', 'hybrid', '--engine', 'mlx', '--json'])).toBe(0)
    expect(JSON.parse(out()).result.rows).toEqual([])
  })
})

describe('atc models pull --engine mlx', () => {
  it('plans the checkpoint of a catalog model: every weight and config file, the MLX engine', async () => {
    await server()
    expect(await t.run(['models', 'pull', MLX, '--engine', 'mlx', '--dry-run', '--json'])).toBe(0)
    const plan = JSON.parse(out()).result
    expect(plan.engine).toBe('mlx')
    expect(plan.files.map((f: { save_path: string }) => f.save_path)).toEqual([
      `workspace-models/mlx/${MLX}/config.json`,
      `workspace-models/mlx/${MLX}/model.safetensors`,
    ])
    expect(plan.total_download_bytes).toBe(5700)
  })

  it('points at the catalog for a repository that is not in it', async () => {
    await server()
    expect(await t.run(['models', 'pull', 'mlx-community/Other-4bit', '--engine', 'mlx'])).toBe(2)
    expect(err()).toContain('atc models catalog --engine mlx')
  })
})

describe('atc run --engine mlx', () => {
  it('loads a downloaded checkpoint the server never loaded before', async () => {
    const paths = await server()
    const dir = join(paths.atcDir, 'media-installations')
    mkdirSync(dir, { recursive: true })
    const plan = {
      digest: 'd'.repeat(64),
      category: 'text',
      model_id: MLX,
      name: 'Qwen3.5 9B',
      engine: 'mlx',
      files: [],
      total_download_bytes: 0,
      load: {
        provider: 'mlx',
        model_id: MLX,
        model_path: join(paths.dataFolder, 'workspace-models', 'mlx', MLX),
      },
      created_at: 1,
    }
    writeFileSync(
      join(dir, 'job-1.json'),
      JSON.stringify({ id: 'job-1', plan, stage: 'ready', updated_at: 1 })
    )
    expect(await t.run(['run', MLX, '--engine', 'mlx'])).toBe(0)
    expect(t.link.calls.find((c) => c.path === `/models/mlx/${MLX}/load`)).toBeDefined()
    // Registered by that load: the real core refuses a load of a model its registry lacks.
    expect(await new ModelRegistry(paths.layout, 'mlx').find(MLX)).toBeDefined()
    expect(out()).toContain(`${MLX} is running on mlx`)
  })
})
