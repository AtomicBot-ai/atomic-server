import { expect, it } from 'vitest'
import { engineUpdateResult } from './engine-updates.js'
import { changedValues } from './settings-form.js'

const source = {
  active: { version: 'b1', variant: 'cpu' },
  latest: { version: 'b2', variant: 'cpu' },
  update: { needed: true, target: { version: 'b2', variant: 'cpu' } },
}

it('offers only the core-approved update and never compares version strings', () => {
  expect(engineUpdateResult(source)).toEqual({ phase: 'available', message: 'Update available: b2.' })
  expect(engineUpdateResult({ ...source, update: { needed: false } })).toMatchObject({ phase: 'current' })
})

it.each([
  undefined,
  { ...source, source_error: 'Offline' },
  { ...source, error: { message: 'Permission denied' } },
  { ...source, update: { ...source.update, blocked_reason: 'requires-newer-app' } },
  { ...source, latest: null, update: { needed: false } },
  { ...source, update: {} },
])('does not report an incomplete or failed check as current (%j)', (entry) => {
  expect(engineUpdateResult(entry).phase).toBe('error')
})

it('keeps a new installation distinct from an update', () => {
  expect(engineUpdateResult({ ...source, active: null })).toEqual({
    phase: 'current',
    message: 'Ready to install.',
  })
})

it('ignores equivalent arrays and objects and returns only actual edits', () => {
  expect(
    changedValues(
      { list: ['a'], config: { enabled: true }, threads: 2 },
      {
        list: ['a'],
        config: { enabled: true },
        threads: 4,
      }
    )
  ).toEqual({ threads: 4 })
})

it('compares missing values with displayed defaults while preserving explicit saved overrides', () => {
  const descriptors = [
    { key: 'mtp', controllerProps: { value: false } },
    { key: 'threads', controllerProps: { value: 4 } },
  ]
  expect(changedValues({}, { mtp: true }, descriptors)).toEqual({ mtp: true })
  expect(changedValues({}, { mtp: false, threads: 4 }, descriptors)).toEqual({})
  expect(changedValues({ mtp: true }, { mtp: false }, descriptors)).toEqual({ mtp: false })
})
