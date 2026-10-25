import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CACHE_TTL_MS, fetchLiteRtLmList, parseLiteRtLmList } from './litert-list.js'

const FIXTURE = new URL('../../../test/fixtures/litert-lm/litert-lm-models.json', import.meta.url)
type Variant = Record<string, unknown> & { file: Record<string, unknown> }
interface Fixture {
  schema_version: number
  huggingface: { backends: Record<string, string[]> }
  models: Array<{ revision: string; variants: Variant[] }>
}
const fixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture

describe('parseLiteRtLmList', () => {
  it('reads conf’s list: models, variants, files and the Hugging Face rules', () => {
    const list = parseLiteRtLmList(fixture())
    expect(list.models.map((m) => m.id)).toEqual(['gemma-4-e4b', 'gemma-3-1b'])
    expect(list.models[0]?.variants.map((v) => [v.id, v.backend, v.npu ?? null])).toEqual([
      ['gemma-4-e4b-npu-lnl', 'npu', 'intel-lnl'],
      ['gemma-4-e4b-gpu', 'gpu', null],
      ['gemma-4-e4b-cpu', 'cpu', null],
    ])
    expect(list.models[0]?.variants[2]?.min_runtime_version).toBe('0.18.0')
    expect(list.huggingface).toEqual({
      orgs: ['litert-community'],
      backends: {
        'macos-arm64': ['cpu', 'gpu'],
        'linux-x64': ['cpu', 'gpu'],
        'linux-arm64': ['cpu'],
        'win-x64': ['cpu', 'npu'],
      },
    })
  })

  it('hides a variant with an NPU target it does not know, and keeps the rest of the model', () => {
    const raw = fixture()
    raw.models[0]!.variants[0]!.npu = 'intel-nvl'
    expect(parseLiteRtLmList(raw).models[0]?.variants.map((v) => v.id)).toEqual([
      'gemma-4-e4b-gpu',
      'gemma-4-e4b-cpu',
    ])
  })

  it.each([
    ['an unknown backend', (v: Variant) => (v.backend = 'tpu')],
    ['an npu variant without a target', (v: Variant) => delete v.npu],
    ['only unknown platforms', (v: Variant) => (v.platforms = ['win-arm64'])],
    ['a file without sha256', (v: Variant) => delete v.file.sha256],
    ['a file that is not .litertlm', (v: Variant) => (v.file.path = 'model.task')],
  ])('hides a variant with %s', (_name, spoil) => {
    const raw = fixture()
    spoil(raw.models[0]!.variants[0]!)
    expect(parseLiteRtLmList(raw).models[0]?.variants.map((v) => v.id)).not.toContain('gemma-4-e4b-npu-lnl')
  })

  it('hides a model left with no variants, and one whose revision is not a commit', () => {
    const raw = fixture()
    raw.models[1]!.variants[0]!.backend = 'tpu'
    raw.models[0]!.revision = 'main'
    expect(parseLiteRtLmList(raw).models).toEqual([])
  })

  it('drops platforms and backends it does not know from the Hugging Face rules', () => {
    const raw = fixture()
    raw.huggingface.backends['win-arm64'] = ['cpu']
    raw.huggingface.backends['linux-arm64'] = ['cpu', 'tpu']
    const { backends } = parseLiteRtLmList(raw).huggingface
    expect(backends['linux-arm64']).toEqual(['cpu'])
    expect(Object.keys(backends)).not.toContain('win-arm64')
  })

  it('accepts an empty list, and refuses a newer schema_version whole', () => {
    expect(parseLiteRtLmList({ ...fixture(), models: [] }).models).toEqual([])
    expect(() => parseLiteRtLmList({ ...fixture(), schema_version: 2 })).toThrow(/schema_version 2/)
  })
})

describe('fetchLiteRtLmList', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
  const scratch = () => {
    const d = mkdtempSync(join(tmpdir(), 'atc-litert-list-'))
    dirs.push(d)
    return d
  }
  const failing: typeof fetch = async () => new Response('down', { status: 503 })

  it('reads a file:// list and caches it; within the hour the cache answers', async () => {
    const d = scratch()
    const cachePath = join(d, 'cache', 'litert-lm-models.json')
    const url = FIXTURE.href
    const first = await fetchLiteRtLmList({ cachePath, url, fetch: failing, now: () => 1000 })
    expect(first).toMatchObject({ source: 'remote', fetchedAt: 1000 })
    const second = await fetchLiteRtLmList({
      cachePath,
      url: 'https://conf.test/x.json',
      fetch: failing,
      now: () => 2000,
    })
    expect(second).toMatchObject({ source: 'cache', fetchedAt: 1000 })
    expect(second.error).toBeUndefined()
  })

  it('uses the last accepted copy when conf cannot be read, and says why', async () => {
    const d = scratch()
    const cachePath = join(d, 'litert-lm-models.json')
    writeFileSync(cachePath, JSON.stringify({ value: fixture(), fetchedAt: 1 }))
    const r = await fetchLiteRtLmList({
      cachePath,
      url: 'https://conf.test/x.json',
      fetch: failing,
      now: () => 1 + CACHE_TTL_MS,
    })
    expect(r).toMatchObject({ source: 'cache', fetchedAt: 1 })
    expect(r.error).toContain('503')
    expect(r.list.models).toHaveLength(2)
  })

  it('keeps the last accepted copy when conf serves a newer schema', async () => {
    const d = scratch()
    const cachePath = join(d, 'litert-lm-models.json')
    writeFileSync(cachePath, JSON.stringify({ value: fixture(), fetchedAt: 1 }))
    const newer: typeof fetch = async () => Response.json({ ...fixture(), schema_version: 9 })
    const r = await fetchLiteRtLmList({
      cachePath,
      url: 'https://conf.test/x.json',
      fetch: newer,
      force: true,
    })
    expect(r.source).toBe('cache')
    expect(r.list.models).toHaveLength(2)
  })

  it('falls back to the bundled release without a copy', async () => {
    const r = await fetchLiteRtLmList({
      cachePath: join(scratch(), 'none.json'),
      url: 'https://conf.test/x.json',
      fetch: failing,
    })
    expect(r).toMatchObject({ source: 'baseline', fetchedAt: null })
    expect(r.list.models).toEqual([])
    expect(r.list.huggingface.orgs).toEqual(['litert-community'])
  })
})
