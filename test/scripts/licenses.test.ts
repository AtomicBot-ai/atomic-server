import { describe, expect, it } from 'vitest'
import { allowed, licenseOf } from '../../scripts/licenses.mjs'

describe('which licenses may ship inside the binary', () => {
  it.each([
    ['MIT', true],
    ['Apache-2.0', true],
    ['BlueOak-1.0.0', true],
    ['(MIT OR CC0-1.0)', true],
    ['(AFL-2.1 OR BSD-3-Clause)', true],
    ['GPL-3.0 OR MIT', true],
    ['MIT AND ISC', true],
    ['MIT AND GPL-3.0', false],
    ['(MIT AND (ISC OR GPL-2.0))', true],
    ['GPL-3.0', false],
    ['AGPL-3.0-only', false],
    ['SSPL-1.0', false],
    ['GPL-2.0 WITH Classpath-exception-2.0', false],
    ['UNLICENSED', false],
    ['', false],
    ['(MIT', false],
    [undefined, false],
  ])('%j → %s', (expression, ok) => {
    expect(allowed(expression)).toBe(ok)
  })
})

describe("a package's license field", () => {
  it.each([
    [{ license: 'MIT' }, 'MIT'],
    [{ license: { type: 'BSD-3-Clause' } }, 'BSD-3-Clause'],
    [{ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }, '(MIT OR Apache-2.0)'],
    [{ licenses: ['ISC'] }, 'ISC'],
    [{}, undefined],
  ])('%j → %s', (pkg, license) => {
    expect(licenseOf(pkg)).toBe(license)
  })
})
