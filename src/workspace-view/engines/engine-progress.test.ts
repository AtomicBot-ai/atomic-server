import { expect, it } from 'vitest'
import { engineProgress } from './engine-progress.js'

it('shows unknown progress until this engine reports bytes and caps the bar during installation', () => {
  expect(engineProgress([{ taskId: 'other', transferred: 50, total: 100 }], 'engine')).toEqual({
    transferred: 0,
    total: 0,
    percent: null,
    status: 'Connecting',
  })
  expect(engineProgress([{ taskId: 'engine', transferred: 25, total: 100 }], 'engine')).toEqual({
    transferred: 25,
    total: 100,
    percent: 25,
    status: 'Downloading',
  })
  expect(engineProgress([{ taskId: 'engine', transferred: 101, total: 100 }], 'engine')).toEqual({
    transferred: 100,
    total: 100,
    percent: 100,
    status: 'Installing',
  })
})
