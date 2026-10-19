import { describe, expect, it } from 'vitest'
import { editableSetting } from './engine-setting-groups'

describe('editableSetting', () => {
  // The build is chosen with engines.activate: the core switches it in the load queue's turn.
  it('keeps the engine build out of the settings form', () => {
    expect(editableSetting({ key: 'version_backend' })).toBe(false)
    expect(editableSetting({ key: 'ctx_size' })).toBe(true)
  })
})
