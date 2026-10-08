import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { ModelCatalog, rankModels, staffPicks, STAFF_PICKS_URL } from './curated.js'
import { searchHub, modelFiles } from './catalog.js'
it('uses desktop staff-pick order and only offers installable formats', () => {
  expect(
    staffPicks({
      picks: [
        { model_name: 'owner/second', order: 2 },
        { model_name: 'owner/first', order: 1, title: 'First' },
        { model_name: 'owner/mlx', format: 'mlx' },
        { model_name: 'owner/disabled', active: false },
      ],
    }).map((r) => r.id)
  ).toEqual(['owner/first', 'owner/second'])
  expect(() => staffPicks({ picks: [] })).toThrow('empty')
  expect(() => staffPicks(null)).toThrow('could not')
})
it('puts matching Atomic Chat quants first and deduplicates search sources', () => {
  const rows = [
    { id: 'popular/Qwen', downloads: 900 },
    { id: 'AtomicChat/Qwen', downloads: 1 },
  ]
  expect(rankModels([...rows, rows[1]!], 'Qwen').map((r) => r.id)).toEqual([
    'AtomicChat/Qwen',
    'popular/Qwen',
  ])
  expect(rankModels(rows, '')[0]?.id).toBe('popular/Qwen')
})
it('opens a useful default list immediately when the network stalls, then refreshes from the desktop feed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-catalog-'))
  const abort = new AbortController()
  let reply!: (r: Response) => void
  const request = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        reply = resolve
      })
  ) as unknown as typeof fetch
  const refreshed = vi.fn()
  try {
    const catalog = new ModelCatalog(dir, request)
    const rows = await catalog.list('', abort.signal, refreshed)
    expect(rows.length).toBeGreaterThan(20)
    expect(rows.some((r) => r.id.startsWith('AtomicChat/'))).toBe(true)
    expect(request).toHaveBeenCalledWith(STAFF_PICKS_URL, expect.anything())
    reply(Response.json({ picks: [{ model_name: 'AtomicChat/fresh', order: 0 }] }))
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalled())
    expect((await catalog.list('', abort.signal))[0]?.id).toBe('AtomicChat/fresh')
    expect(request).toHaveBeenCalledTimes(1)
  } finally {
    abort.abort()
    await rm(dir, { recursive: true, force: true })
  }
})
it('queries the Atomic Chat author separately so download popularity cannot hide its quants', async () => {
  const urls: URL[] = []
  const request = (async (input: unknown) => {
    const url = new URL(String(input))
    urls.push(url)
    return Response.json(
      url.searchParams.get('author') === 'AtomicChat'
        ? [{ id: 'AtomicChat/Qwen', downloads: 1 }]
        : [{ id: 'popular/Qwen', downloads: 999 }]
    )
  }) as typeof fetch
  expect((await searchHub('Qwen', request)).map((r) => r.id)).toEqual(['AtomicChat/Qwen', 'popular/Qwen'])
  expect(urls.some((u) => u.searchParams.get('author') === 'AtomicChat')).toBe(true)
})
it('reads actual GGUF variants and puts the balanced quant before larger files', async () => {
  const request = (async () =>
    Response.json({
      siblings: [
        { rfilename: 'model.Q8_0.gguf', size: 8000 },
        { rfilename: 'mmproj.gguf', size: 10 },
        { rfilename: 'model.Q4_K_M.gguf', size: 4000 },
      ],
    })) as typeof fetch
  expect((await modelFiles('owner/model', request)).map((f) => f.filename)).toEqual([
    'model.Q4_K_M.gguf',
    'model.Q8_0.gguf',
  ])
})
