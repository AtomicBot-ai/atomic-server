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
