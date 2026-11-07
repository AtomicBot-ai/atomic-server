import { expect, it, vi } from 'vitest'
import { assertBuildRuntime, BUN_VERSION } from '../../scripts/build-runtime.mjs'

it('accepts the pinned runtime from PATH', () => {
  const run = vi.fn(() => ({ status: 0, stdout: `${BUN_VERSION}\r\n` }))
  expect(() => assertBuildRuntime(run)).not.toThrow()
  expect(run).toHaveBeenCalledWith('bun', ['--version'], { encoding: 'utf8' })
})

it.each(['1.3.10', '1.3.14', '1.4.4-canary.1', '9.0.0', ''])(
  'refuses unverified runtime %s before compiling',
  (version) => {
    expect(() => assertBuildRuntime(() => ({ status: 0, stdout: version }))).toThrow(
      `Building atc requires Bun ${BUN_VERSION}`
    )
  }
)

it('explains a missing or broken compiler', () => {
  expect(() => assertBuildRuntime(() => ({ status: null }))).toThrow('no working bun on PATH')
})
