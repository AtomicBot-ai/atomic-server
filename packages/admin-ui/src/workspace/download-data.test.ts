import { describe, expect, it } from 'vitest'
import { downloadRows } from './download-data'
describe('durable download progress', () => {
  it('associates Core taskId transfers with their setup without duplicate rows', () => {
    const [job] = downloadRows(
      [
        {
          setup_id: 'setup',
          stage: 'downloading_projector',
          plan: { model_id: 'model', total_download_bytes: 300, model: { size: 200 } },
          task_ids: { model: 'weights', projector: 'vision' },
        },
      ],
      [{ taskId: 'vision', total: 100, transferred: 50, percent: 50 }]
    )
    expect(job).toMatchObject({
      id: 'setup',
      total: 300,
      transferred: 250,
      state: 'downloading_projector',
      owner: 'setup',
    })
  })
  it('retains standalone engine downloads and omits completed setups', () => {
    expect(
      downloadRows(
        [{ id: 'media', stage: 'ready', plan: { category: 'video', total_download_bytes: 999 } }],
        [{ taskId: 'engine', total: 10, transferred: 2 }]
      )
    ).toMatchObject([{ id: 'engine', owner: 'download' }])
  })
})
