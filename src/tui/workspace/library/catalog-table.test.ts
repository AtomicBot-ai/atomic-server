import { expect, it } from 'vitest'
import { createWorkspace } from '../state.js'
import { catalogIndexes } from './catalog-filters.js'
import { catalogColumns, catalogValue, drawCatalogColumns } from './catalog-table.js'
import { workspaceFrame } from '../frame.js'
import { canvas, COLORS, hit } from '../draw/canvas.js'
import { withInstalledRows } from './catalog-installed.js'
it('sorts known metadata and leaves unknown values last in both directions', () => {
  const s = createWorkspace('models')
  s.libraryRows = [2, undefined, 10].map((parameters, i) => ({
    id: String(i),
    name: String(i),
    category: 'text',
    description: '',
    source: { parameters },
  }))
  s.catalogFilters.sort = 'column:parameters:asc'
  expect(catalogIndexes(s)).toEqual([0, 2, 1])
  s.catalogFilters.sort = 'column:parameters:desc'
  expect(catalogIndexes(s)).toEqual([2, 0, 1])
  expect(catalogValue(s.libraryRows[1]!, 'parameters')).toBeUndefined()
  expect(catalogColumns(120).map((c) => c.label)).toContain('Engines')
  expect(catalogColumns(40).map((c) => c.label)).toEqual(['Model', 'Format'])
})
it('keeps imported files in Local models without duplicating a known installed catalog model', () => {
  const s = createWorkspace('models')
  s.installed = [
    { id: 'imported', name: 'Imported', provider: 'llamacpp-upstream' },
    { id: 'known', name: 'Known', provider: 'mlx' },
  ]
  const rows = [{ id: 'known', name: 'Known', category: 'text', description: '' }]
  expect(withInstalledRows(rows, s).map((r) => r.id)).toEqual(['imported', 'known'])
  s.libraryCategory = 'image'
  expect(withInstalledRows(rows, s)).toEqual(rows)
})

it('keeps sort direction visible in constrained table headings', () => {
  const c = canvas(120, 36)
  drawCatalogColumns(c, 2, 5, 83, 'catalog-column:parameters', 'column:parameters:desc')
  const col = catalogColumns(83).find((c) => c.key === 'parameters')!
  const text = c.cells[5]!.slice(2 + col.offset, 2 + col.offset + col.width - 1)
    .map((c) => c.char)
    .join('')
  expect(text.endsWith(' v')).toBe(true)
  expect(hit(c, 2 + col.offset, 5)?.id).toBe('catalog-column:parameters')
  expect(c.cells[5]![2 + col.offset]!.background).toBe(COLORS.focus)
})
it.each([
  [54, 24],
  [120, 36],
])('keeps table rows and their inline controls separate at %s×%s', (width, height) => {
  const s = { ...createWorkspace('models'), setupComplete: true, focus: 'catalog-row:0' }
  s.libraryRows = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    name: `Model ${index}`,
    description: 'Model description',
    category: 'text',
  }))
  const frame = workspaceFrame(s, width!, height!, 0)
  const rows = frame.targets.filter((t) => t.id.startsWith('catalog-row:'))
  expect(rows.length).toBeGreaterThan(1)
  expect(rows.every((t) => t.height === 2)).toBe(true)
  for (const row of rows) {
    expect(hit(frame, row.x + 3, row.y)?.id).toBe(row.id)
    expect(row.y + row.height).toBeLessThanOrEqual(height! - 3)
  }
})
