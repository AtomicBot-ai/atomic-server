/** `atc models catalog|search --engine litert-lm` (spec litert-lm-server, "Модели LiteRT-LM в atc"). */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { workspaceServer } from '../helpers/workspace-server.js'

const hub = new FixtureHttpServer()
const scratch = mkdtempSync(join(tmpdir(), 'atc-litert-models-'))
// Not `.pathname`: on Windows that is `/D:/…`, which a path function turns into `D:\D:\…`.
const LIST = fileURLToPath(new URL('../fixtures/litert-lm/litert-lm-models.json', import.meta.url))
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

const E2B = 'litert-community/gemma-4-E2B-it-litert-lm'
const E4B = 'litert-community/gemma-4-E4B-it-litert-lm'
const SHA = 'e'.repeat(40)
const lfs = (rfilename: string) => ({ rfilename, size: 135, lfs: { sha256: 'f'.repeat(64), size: 4096 } })

/** The Hub: conf's organisation lists the spec's repository and one conf already curates. */
function serveHub() {
  hub.reset()
  const listing = [{ id: E2B }, { id: E4B }]
  hub.files.set('/api/models?author=litert-community&filter=litert-lm&limit=50', {
    body: Buffer.from(JSON.stringify(listing)),
  })
  hub.files.set('/api/models?author=litert-community&filter=litert-lm&limit=50&search=gemma', {
    body: Buffer.from(JSON.stringify(listing)),
  })
  const revision = {
    sha: SHA,
    gated: 'auto',
    cardData: { license: 'apache-2.0' },
    siblings: [
      { rfilename: 'README.md', size: 10 },
      lfs('gemma-4-E2B-it.litertlm'),
      lfs('gemma-4-E2B-it-gpu.litertlm'),
      lfs('gemma-4-E2B-it-web.litertlm'),
      lfs('gemma-4-E2B-it_intel_LNL.litertlm'),
      lfs('gemma-4-E2B-it_Google_Tensor_G5.litertlm'),
    ],
  }
  for (const repo of [E2B, E4B])
    hub.files.set(`/api/models/${repo}/revision/main?blobs=true&files_metadata=true`, {
      body: Buffer.from(JSON.stringify(revision)),
    })
}

/** A server whose core registers LiteRT-LM on `platform`/`arch` and judges every variant `ok`. */
async function server(platform: NodeJS.Platform, arch: string, listUrl?: string) {
  serveHub()
  t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  t.link.responses['POST /engines/versions'] = { engines: [{ engine: 'litert-lm' }] }
  t.link.responses['POST /models/litert-lm/check'] = (body: { backend?: string }) =>
    body.backend === 'npu'
      ? { verdict: 'accelerator-not-prepared', reason: 'openvino is not prepared' }
      : { verdict: 'ok', reason: null }
  const copy = join(scratch, `${Math.random().toString(36).slice(2)}.json`)
  copyFileSync(LIST, copy)
  const env = { ATC_LITERT_LM_MODELS_URL: listUrl ?? pathToFileURL(copy).href, HF_ENDPOINT: base }
  const ws = await workspaceServer(t.link, paths, env, undefined, { platform, arch })
  close = ws.close
  return paths
}
const hubCalls = () => hub.requests.filter((r) => r.path.startsWith('/api/'))

describe('atc models catalog --engine litert-lm', () => {
  it('shows only conf’s models, with the Linux variants and the core’s verdicts, and asks Hugging Face nothing', async () => {
    await server('linux', 'x64')
    expect(await t.run(['models', 'catalog', '--engine', 'litert-lm'])).toBe(0)
    expect(out()).toContain('Gemma 4 E4B (gemma-4-e4b)')
    expect(out()).toMatch(/\* gemma-4-e4b-gpu\s+gpu\s+.*ok/)
    expect(out()).toMatch(/gemma-4-e4b-cpu\s+cpu\s+.*ok/)
    expect(out()).not.toContain('gemma-4-e4b-npu-lnl')
    expect(out()).toMatch(/Gemma 3 1B \(gemma-3-1b\).*gated/)
    expect(out()).not.toContain(E2B)
    expect(hubCalls()).toEqual([])
  })

  it('uses the last copy when conf cannot be read, and says so', async () => {
    const paths = await server('linux', 'x64', `${base}/missing.json`)
    mkdirSync(join(paths.atcDir, 'cache'), { recursive: true })
    // A copy accepted long ago: past the hour, conf is asked again, fails, and the copy answers.
    writeFileSync(
      join(paths.atcDir, 'cache', 'litert-lm-models.json'),
      JSON.stringify({ value: JSON.parse(readFileSync(LIST, 'utf8')), fetchedAt: 1 })
    )
    expect(await t.run(['models', 'catalog', '--engine', 'litert-lm'])).toBe(0)
    expect(err()).toMatch(/LiteRT-LM list could not be read .*last copy/)
    expect(out()).toContain('Gemma 4 E4B (gemma-4-e4b)')
  })

  it('says LiteRT-LM is not available where the core does not register it', async () => {
    await server('linux', 'x64')
    t.link.responses['POST /engines/versions'] = { engines: [] }
    expect(await t.run(['models', 'catalog', '--engine', 'litert-lm'])).toBe(2)
    expect(err()).toContain('LiteRT-LM is not available on this platform: the core does not offer it here.')
  })
})

describe('atc models search --engine litert-lm', () => {
  it('lists conf’s models first, then Hugging Face’s, marked unverified, with the variants their names give', async () => {
    await server('linux', 'x64')
    expect(await t.run(['models', 'search', 'gemma', '--engine', 'litert-lm'])).toBe(0)
    const text = out()
    expect(text.indexOf('Gemma 4 E4B (gemma-4-e4b)')).toBeLessThan(text.indexOf(E2B))
    expect(text).toContain(`${E2B} — Hugging Face, not verified by Atomic Chat, gated: needs HF_TOKEN`)
    expect(text).toMatch(/\* gemma-4-e2b-it-gpu\s+gpu/)
    expect(text).toMatch(/gemma-4-e2b-it-cpu\s+cpu/)
    expect(text).not.toMatch(/web|Tensor|intel-lnl/)
    // conf curates E4B's repository: its entry is conf's, not a second one from the Hub.
    expect(text).not.toContain(`${E4B} — Hugging Face`)
  })

  it('offers no GPU variant of a Hugging Face model where conf closes it (Windows: cpu, npu)', async () => {
    await server('win32', 'x64')
    expect(await t.run(['models', 'search', '--engine', 'litert-lm', '--json'])).toBe(0)
    const result = JSON.parse(out()) as {
      models: Array<{
        origin: string
        unverified: boolean
        default_variant: string | null
        variants: Array<{ id: string; backend: string }>
      }>
    }
    const hf = result.models.find((m) => m.origin === 'huggingface')!
    expect(hf.unverified).toBe(true)
    expect(hf.variants.map((v) => v.backend)).toEqual(['npu', 'cpu'])
    // NPU first among those that run or will once prepared.
    expect(hf.default_variant).toBe('gemma-4-e2b-it-npu-intel-lnl')
  })

  it('shows conf’s models and says Hugging Face is unreachable when its listing fails', async () => {
    await server('linux', 'x64')
    hub.files.clear()
    expect(await t.run(['models', 'search', 'gemma', '--engine', 'litert-lm'])).toBe(0)
    expect(err()).toContain('Hugging Face is not reachable now')
    expect(out()).toContain('Gemma 4 E4B (gemma-4-e4b)')
    expect(out()).not.toContain(E2B)
  })
})
