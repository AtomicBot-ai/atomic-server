import { expect, it } from 'vitest'
import { catalogWindow } from './catalog-window.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import type { Key } from 'ink'

it('counts an expansion only while it is visible, filling the table after scrolling past it', () => {
  expect(catalogWindow([], 0, 30)).toEqual({ start: 0, count: 0 })
  const heights = Array.from({ length: 70 }, (_, i) => (i === 4 ? 15 : 2))
  expect(catalogWindow(heights, 4, 30)).toEqual({ start: 0, count: 9 })
  expect(catalogWindow(heights, 30, 30)).toEqual({ start: 16, count: 15 })
  expect(catalogWindow(heights, 69, 30)).toEqual({ start: 55, count: 15 })
})

it.each([
  [60, 20],
  [80, 24],
  [90, 32],
  [100, 30],
  [120, 40],
  [160, 50],
])('keeps the table filled after keyboard and mouse scrolling at %s×%s', (width, height) => {
  let s = {
    ...createWorkspace('models'),
    setupComplete: true,
    catalogOpen: 'model4',
    selected: 4,
    focus: 'catalog-row:4',
  }
  s.libraryRows = Array.from({ length: 70 }, (_, i) => ({
    id: `model${i}`,
    name: `Model ${i}`,
    description: 'Choose a build',
    category: 'text',
  }))
  s.catalogVariants = Array.from({ length: 5 }, (_, i) => ({ value: `q${i}.gguf`, label: `q${i}.gguf` }))
  for (const mouse of [false, true]) {
    for (let n = 0; n < 35; n++) {
      const frame = workspaceFrame(s, width!, height!, 0)
      const result = workspaceInput(
        mouse ? '\u001b[<65;55;15M' : '',
        (mouse ? {} : { downArrow: true }) as Key,
        s,
        frame
      )
      s = { ...s, ...result.patch }
    }
    const expanded = workspaceFrame(s, width!, height!, 0)
    const collapsed = workspaceFrame({ ...s, catalogOpen: '' }, width!, height!, 0)
    const rows = (f: typeof expanded) => f.targets.filter((t) => t.id.startsWith('catalog-row:'))
    expect(rows(expanded)).toEqual(rows(collapsed))
    expect(rows(expanded).at(-1)!.y + 2).toBeGreaterThanOrEqual(height! - 6)
  }
})
