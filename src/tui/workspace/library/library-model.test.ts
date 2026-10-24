import { expect, it } from 'vitest'
import { libraryRows } from './library-model.js'
it('uses product engine names while keeping stable operation IDs', () => {
  expect(
    libraryRows(
      { engines: [{ engine: 'llamacpp-upstream', active: { version: 'b1', variant: 'metal' } }] },
      'engines'
    )[0]
  ).toMatchObject({ id: 'llamacpp-upstream', name: 'llama.cpp', description: 'Installed · b1 · metal' })
})
