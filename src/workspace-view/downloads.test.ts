import { describe, expect, it } from 'vitest'
import { downloadRows } from './index.js'

describe('shared Downloads view', () => {
  it('removes verified models and their stale transfer events without changing records', () => {
    const setups = [
      { setup_id: 'chat', stage: 'ready', task_ids: { model: 'weights' }, plan: { model_id: 'chat' } },
      { id: 'image', stage: 'ready', plan: { category: 'image', model_id: 'image' } },
    ]
    const original = structuredClone(setups)
    expect(
      downloadRows(setups, [
        { taskId: 'weights', total: 100, transferred: 90 },
        { taskId: 'image', total: 200, transferred: 199 },
      ])
    ).toEqual([])
    expect(setups).toEqual(original)
  })

  it.each(['complete', 'completed', 'succeeded', 'success', 'done'])(
    'removes terminal %s records from both sources',
    (status) => {
      expect(downloadRows([{ id: 'setup', status }], [{ task_id: 'transfer', status }])).toEqual([])
    }
  )

  it('keeps verification visible until it succeeds and retains recoverable failures', () => {
    const rows = downloadRows(
      [
        { id: 'verify', stage: 'verifying', plan: { total_download_bytes: 100 } },
        { id: 'paused', stage: 'paused' },
        { id: 'failed', stage: 'failed', error: 'disk full' },
        { id: 'cancelled', stage: 'cancelled' },
      ],
      [{ taskId: 'interrupted', status: 'interrupted', total: 100, transferred: 100 }]
    )
    expect(rows.map((row) => row.id)).toEqual(['verify', 'paused', 'failed', 'cancelled', 'interrupted'])
    expect(rows[0]).toMatchObject({ state: 'verifying', total: 100, transferred: 100, owner: 'setup' })
  })

  it('uses the same normalized IDs and owners after completed rows disappear', () => {
    expect(
      downloadRows(
        [
          { id: 'done', stage: 'ready' },
          { setup_id: 'chat', stage: 'failed', plan: { model_id: 'text' } },
          { id: 'media', stage: 'failed', plan: { category: 'video' } },
        ],
        [{ taskId: 'engine', total: 100, transferred: 20 }]
      ).map(({ id, owner }) => ({ id, owner }))
    ).toEqual([
      { id: 'chat', owner: 'setup' },
      { id: 'media', owner: 'artifacts' },
      { id: 'engine', owner: 'download' },
    ])
  })

  it('aggregates model and projector progress without duplicate task rows', () => {
    expect(
      downloadRows(
        [
          {
            setup_id: 'chat',
            stage: 'downloading_projector',
            plan: { total_download_bytes: 350, engine: { download_size: 50 }, model: { size: 200 } },
            task_ids: { projector: 'vision' },
          },
        ],
        [{ taskId: 'vision', total: 100, transferred: 25 }]
      )
    ).toMatchObject([{ id: 'chat', state: 'downloading_projector', total: 350, transferred: 275 }])
  })

  it.each([
    ['downloading_model', 75],
    ['downloading_projector', 275],
  ])('keeps completed stages when pausing %s and reconnecting', (stage, expected) => {
    const setup = {
      setup_id: 'chat',
      stage,
      plan: { total_download_bytes: 350, engine: { download_size: 50 }, model: { size: 200 } },
      task_ids: { model: 'weights', projector: 'vision' },
    }
    const taskId = stage === 'downloading_model' ? 'weights' : 'vision'
    const running = downloadRows([setup], [{ taskId, transferred: 25 }])[0]
    const paused = downloadRows([{ ...setup, stage: 'cancelled', stopped_at: stage, transferred: 25 }], [])[0]
    expect(running?.transferred).toBe(expected)
    expect(paused).toMatchObject({ state: 'cancelled', total: 350, transferred: expected })
  })

  it.each(['cancelled', 'failed', 'interrupted'])(
    'keeps downloaded bytes visible when verification is %s',
    (stage) => {
      expect(
        downloadRows(
          [{ id: 'chat', stage, stopped_at: 'verifying', plan: { total_download_bytes: 350 } }],
          []
        )
      ).toMatchObject([{ state: stage, total: 350, transferred: 350 }])
    }
  )

  it('removes completed standalone transfers without treating zero-size transfers as complete', () => {
    expect(
      downloadRows(
        [],
        [
          { taskId: 'finished', total: 100, transferred: 100 },
          { taskId: 'unknown', total: 0, transferred: 0 },
          { taskId: 'active', total: 100, transferred: 10 },
          { taskId: 'active', total: 100, transferred: 10 },
        ]
      ).map((row) => row.id)
    ).toEqual(['unknown', 'active'])
  })
})

describe('store and Foundry Local downloads', () => {
  it('count against their plan’s download size and are named by their model', () => {
    const rows = downloadRows(
      [
        {
          id: 'm1',
          kind: 'managed-model',
          stage: 'downloading',
          plan: { repository: 'Qwen/Qwen3.5-2B', download_bytes: 1000 },
        },
        {
          id: 'f1',
          kind: 'foundry-model',
          stage: 'downloading',
          // A Foundry Local plan names both: the model and the variant it installs as.
          plan: { model_id: 'phi', variant_id: 'phi-cpu', download_bytes: 400 },
        },
      ],
      [
        { taskId: 'm1', transferred: 250, total: 1000 },
        { taskId: 'f1', transferred: 100, total: 400 },
      ]
    )
    expect(rows.map((r) => [r['model_id'], r.transferred, r.total])).toEqual([
      ['Qwen/Qwen3.5-2B', 250, 1000],
      ['phi-cpu', 100, 400],
    ])
  })
})

it('retains completed models in Downloads without reviving child transfer events in background cards', () => {
  const jobs = [
    {
      setup_id: 'done',
      stage: 'ready',
      task_ids: { model: 'weights' },
      plan: { model_id: 'Qwen', total_download_bytes: 100 },
    },
  ]
  const transfers = [{ taskId: 'weights', transferred: 98, total: 100 }]
  expect(downloadRows(jobs, transfers)).toEqual([])
  expect(downloadRows(jobs, transfers, true)).toMatchObject([
    { id: 'done', completed: true, total: 100, transferred: 100 },
  ])
})

it('merges a durable engine job with its transient progress, retains only completed history, and never offers model controls', () => {
  const progress = { taskId: 'engine', transferred: 50, total: 100 }
  const job = {
    id: 'engine',
    taskId: 'engine',
    kind: 'engine',
    name: 'Atomic Prism',
    stage: 'downloading',
    transferred: 50,
    total: 100,
  }
  expect(downloadRows([], [progress, job])).toMatchObject([
    { id: 'engine', name: 'Atomic Prism', owner: 'download', transferred: 50 },
  ])
  const completed = { ...job, stage: 'ready', transferred: 100 }
  expect(downloadRows([], [progress, completed])).toEqual([])
  expect(downloadRows([], [progress, completed], true)).toMatchObject([
    { id: 'engine', completed: true, transferred: 100 },
  ])
})

it('prioritizes live progress without losing paused or failed jobs', async () => {
  const { prioritizeDownloads } = await import('./index.js')
  const rows = downloadRows(
    [
      { id: 'failed', stage: 'failed' },
      { id: 'paused', stage: 'paused' },
      { id: 'queued', stage: 'queued' },
      { id: 'active', stage: 'downloading' },
    ],
    []
  )
  expect(prioritizeDownloads(rows).map((row) => row.id)).toEqual(['active', 'queued', 'paused', 'failed'])
  expect(rows.map((row) => row.id)).toEqual(['failed', 'paused', 'queued', 'active'])
})
