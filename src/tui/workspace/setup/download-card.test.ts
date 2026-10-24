import { expect, it } from 'vitest'
import { canvas } from '../draw/canvas.js'
import { createWorkspace } from '../state.js'
import { drawDownloadCard, downloadCardHeight } from './download-card.js'

it.each([
  [46, 2, '~5 min left'],
  [41, 2, '~5 min'],
  [46, 0, 'Estimating'],
  [41, 0, 'ETA…'],
])(
  'keeps status and estimated time readable in a %s-column download (%s bytes/sec)',
  (width, speed, estimate) => {
    const s = createWorkspace('welcome')
    s.workspace = {
      setups: [
        {
          id: 'job',
          stage: 'downloading_model',
          plan: { model_id: 'Fixture 4B', total_download_bytes: 1000 },
        },
      ],
      downloads: [{ taskId: 'job', transferred: 500, total: 1000 }],
    } as never
    s.transferSamples['job'] = { bytes: 500, speed: Number(speed), at: 1000 }
    const c = canvas(54, 24)
    drawDownloadCard(c, s, 2, 3, Number(width))
    const text = c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
    expect(text).toContain('Downloading')
    expect(text).toContain(String(estimate))
    expect(text).toContain('Fixture 4B')
    expect(c.cells[5]![2 + Number(width) - 1]!.char).toBe('|')
  }
)
it('reserves a compact strip only on short terminals', () => {
  expect(downloadCardHeight(24)).toBe(4)
  expect(downloadCardHeight(36)).toBe(5)
})
