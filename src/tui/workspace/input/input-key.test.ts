import { expect, it } from 'vitest'
import { tabTarget } from './input-key.js'

it('wraps Tab between controls in both directions and handles empty screens', () => {
  const targets = [{ id: 'first' }, { id: 'last' }]
  expect(tabTarget('last', targets, false).patch.focus).toBe('first')
  expect(tabTarget('first', targets, true).patch.focus).toBe('last')
  expect(tabTarget('gone', targets, false).patch.focus).toBe('first')
  expect(tabTarget('', [], false).patch.focus).toBe('')
})
