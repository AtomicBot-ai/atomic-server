/** `atc models pull … --engine litert-lm` (spec litert-lm-server, "Модели LiteRT-LM в atc") against a server's workspace. */
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { workspaceServer } from '../helpers/workspace-server.js'

const hub = new FixtureHttpServer()
const scratch = mkdtempSync(join(tmpdir(), 'atc-litert-pull-'))
let base = ''
beforeAll(async () => {
  base = await hub.start()
})
afterAll(async () => {
  hub.release()
  await hub.stop()
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

const REPO = 'litert-community/gemma-4-E4B-it-litert-lm'
const REV = '3'.repeat(40)
const GPU = Buffer.from('gpu weights')
const CPU = Buffer.from('cpu weights')
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

function list(gated: boolean) {
  const variant = (id: string, backend: string, path: string, body: Buffer) => ({
    id,
    backend,
    platforms: ['linux-x64'],
    file: { path, size: body.length, sha256: sha(body) },
  })
  const path = join(scratch, `${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(
    path,
    JSON.stringify({
      schema_version: 1,
      updated_at: '2026-10-21T00:00:00Z',
      huggingface: { orgs: [], filter: 'litert-lm', backends: {} },
      models: [
        {
          ...{
            id: 'gemma-4-e4b',
            name: 'Gemma 4 E4B',
            description: 'Gemma 4.',
            task: 'chat',
            license: 'gemma',
          },
          ...{
            repo: REPO,
            revision: REV,
            gated,
            context_length: 32768,
            tools: true,
            reasoning: true,
            vision: true,
          },
          variants: [
            variant('gemma-4-e4b-gpu', 'gpu', 'gemma-4-E4B-it-gpu.litertlm', GPU),
            variant('gemma-4-e4b-cpu', 'cpu', 'gemma-4-E4B-it.litertlm', CPU),
          ],
        },
      ],
    })
  )
  return pathToFileURL(path).href
}

/** A Linux server whose core registers LiteRT-LM and says every variant and file runs. */
async function server(o: { gated?: boolean; token?: string } = {}) {
  hub.reset()
  hub.files.set(`/${REPO}/resolve/${REV}/gemma-4-E4B-it-gpu.litertlm`, { body: GPU })
  hub.files.set(`/${REPO}/resolve/${REV}/gemma-4-E4B-it.litertlm`, { body: CPU })
  t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  t.link.responses['POST /engines/versions'] = { engines: [{ engine: 'litert-lm' }] }
  t.link.responses['POST /models/litert-lm/check'] = { verdict: 'ok', reason: null }
  const env = {
    ATC_LITERT_LM_MODELS_URL: list(o.gated ?? false),
    HF_ENDPOINT: base,
    ...(o.token ? { HF_TOKEN: o.token } : {}),
  }
  const ws = await workspaceServer(t.link, paths, env, undefined, { platform: 'linux', arch: 'x64' })
  close = ws.close
  return join(paths.dataFolder, 'litert-lm', 'models')
}

describe('atc models pull --engine litert-lm', () => {
  it('downloads the default variant (GPU before CPU here) and follows it to ready', async () => {
    const models = await server()
    expect(await t.run(['models', 'pull', 'gemma-4-e4b', '--engine', 'litert-lm'])).toBe(0)
    expect(out()).toContain('gemma-4-e4b-gpu (GPU)')
    expect(out()).toContain('atc run gemma-4-e4b-gpu --engine litert-lm')
    expect(existsSync(join(models, 'gemma-4-e4b-gpu', 'model.yml'))).toBe(true)
  })

  it('takes the variant for --backend', async () => {
    const models = await server()
    expect(await t.run(['models', 'pull', 'gemma-4-e4b', '--engine', 'litert-lm', '--backend', 'cpu'])).toBe(
      0
    )
    expect(existsSync(join(models, 'gemma-4-e4b-cpu', 'gemma-4-E4B-it.litertlm'))).toBe(true)
  })

  it('refuses a gated model without HF_TOKEN, naming it and the terms’ page, and writes nothing', async () => {
    const models = await server({ gated: true })
    expect(await t.run(['models', 'pull', 'gemma-4-e4b', '--engine', 'litert-lm'])).toBe(2)
    expect(err()).toContain('HF_TOKEN')
    expect(err()).toContain(`https://huggingface.co/${REPO}`)
    expect(existsSync(models)).toBe(false)
    expect(hub.requests.filter((r) => r.path.includes('/resolve/'))).toEqual([])
  })

  it('shows the plan alone with --dry-run', async () => {
    const models = await server()
    expect(await t.run(['models', 'pull', 'gemma-4-e4b', '--engine', 'litert-lm', '--dry-run'])).toBe(0)
    expect(out()).toMatch(/Verdict: ok/)
    expect(existsSync(models)).toBe(false)
  })

  it('cancels a download by its request id', async () => {
    await server()
    hub.files.set(`/${REPO}/resolve/${REV}/gemma-4-E4B-it-gpu.litertlm`, { body: GPU, holdAfterBytes: 2 })
    const args = [
      'models',
      'pull',
      'gemma-4-e4b',
      '--engine',
      'litert-lm',
      '--detach',
      '--request-id',
      'lr-1',
    ]
    expect(await t.run(args)).toBe(0)
    expect(await t.run(['models', 'pull', '--cancel', 'lr-1', '--engine', 'litert-lm'])).toBe(0)
    expect(out()).toContain('lr-1')
  })
})
