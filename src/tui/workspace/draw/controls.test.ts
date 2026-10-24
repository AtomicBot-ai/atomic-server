import { expect, it } from 'vitest'
import { canvas, COLORS, hit } from './canvas.js'
import {
  fieldControl,
  navigationRow,
  quietButton,
  scrollTrack,
  toggleControl,
  saveActions,
} from './controls.js'

it('keeps editable values, dropdown affordances and field hit bounds together', () => {
  const c = canvas(54, 24)
  fieldControl(
    c,
    'model',
    4,
    5,
    40,
    'Model with a very long identifier that does not fit',
    'Choose model',
    'model',
    true
  )
  expect(c.cells[5]![4]!.color).toBe(COLORS.gold)
  expect(c.cells[5]![43]!.char).toBe(']')
  expect(c.cells[5]![40]!.char).toBe('v')
  expect(hit(c, 30, 5)?.id).toBe('model')
  expect(hit(c, 44, 5)).toBeUndefined()
})
it('distinguishes selected navigation from primary actions and focused switches', () => {
  const c = canvas(54, 24)
  navigationRow(c, 'section', 2, 4, 22, 'Configuration', '', true)
  toggleControl(c, 'enabled', 38, 5, true, 'Enable', 'enabled')
  quietButton(c, 'skip', 4, 7, 'Skip setup', 'Open Server', '')
  expect(c.cells[4]![2]!.background).toBe(COLORS.focus)
  expect(c.cells[5]![38]!.background).toBe(COLORS.composer)
  expect(c.cells[7]![4]!.color).toBe(COLORS.muted)
  expect(hit(c, 44, 5)?.id).toBe('enabled')
})
it('shows the visible window in a bounded scroll track', () => {
  const c = canvas(54, 24)
  scrollTrack(c, 50, 4, 6, 0, 2, 10)
  expect(c.cells[4]![50]!.char).toBe('#')
  scrollTrack(c, 50, 4, 6, 8, 2, 10)
  expect(c.cells[9]![50]!.char).toBe('#')
  expect(c.cells[10]![50]!.char).toBe(' ')
})

it.each([41, 83])('keeps Discard immediately before the primary Save action in a %s-column form', (width) => {
  const c = canvas(120, 36)
  saveActions(c, 11, 20, width, 'settings-save')
  const save = c.targets.find((t) => t.id === 'settings-save')!
  const discard = c.targets.find((t) => t.id === 'settings-discard')!
  expect(discard.x + discard.width).toBeLessThan(save.x)
  expect(save.x + save.width).toBe(11 + width)
  expect(save.y + 1).toBe(discard.y)
  expect(hit(c, save.x, save.y)?.id).toBe(save.id)
})
