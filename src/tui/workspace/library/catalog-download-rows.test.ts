import { expect, it } from 'vitest'
import type { Key } from 'ink'
import { canvas } from '../draw/canvas.js'
import { createWorkspace } from '../state.js'
import { drawCatalogDownloadRows, catalogDownloadInput } from './catalog-download-rows.js'

it.each([40, 60, 100])(
  'keeps every visible build and its compact Download button on one row at width %i',
  (width) => {
    let s = {
      ...createWorkspace('models'),
      catalogOpen: 'repo',
      focus: 'catalog-download-variant:0:0',
      libraryRows: [{ id: 'repo', name: 'Model', source: { format: 'gguf' } }] as never,
      catalogVariants: Array.from({ length: 10 }, (_, i) => ({ value: `Q${i}.gguf`, label: `Q${i}.gguf` })),
    }
    for (let i = 0; i < 10; i++) {
      const c = canvas(width, 20)
      drawCatalogDownloadRows(c, s, 0, 1, 2, width - 2, 8, s.focus)
      const target = c.targets.find((t) => t.id === s.focus)!
      expect(target).toBeDefined()
      expect(target.height).toBe(1)
      expect(target.x + target.width).toBeLessThanOrEqual(width)
      expect(c.cells[target.y]!.map((cell) => cell.char).join('')).toContain(`Q${i}.gguf`)
      const next = catalogDownloadInput('', { downArrow: true } as Key, s)
      s = { ...s, ...next!.patch }
    }
    expect(catalogDownloadInput('', { downArrow: true } as Key, { ...s, overlay: 'help' })).toBeNull()
  }
)
