import { expect, it } from 'vitest'
import { sameFiles } from './same-files.js'
import type { ModelSetupPlan } from './types.js'

const plan = (model: Record<string, unknown>, projector: Record<string, unknown> | null = null) =>
  ({
    model: { repo: 'o/r', file: 'm.gguf', revision: 'a', sha256: 'h', size: 1, ...model },
    projector,
  }) as ModelSetupPlan

it.each([
  ['another commit of the repository', plan({}), plan({ revision: 'b' }), true],
  ['the file uploaded again', plan({}), plan({ sha256: 'g', size: 2 }), false],
  ['a projector added', plan({}), plan({}, { file: 'mmproj.gguf', sha256: 'p', size: 3 }), false],
  ['no plan to compare', plan({}), undefined, false],
])('%s → same: %s', (_name, a, b, same) => {
  expect(sameFiles(a, b)).toBe(same)
})
