/**
 * The core's Foundry Local host inside atc: the core starts it as `atc foundry-host …`, so the entry
 * hands that argv to `@atomic-chat/core/foundry-host` before atc's own commands. The probe case needs
 * the compiled binary — only there does the core's FFI module load.
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, BINARY, runAtc } from '../helpers/binary.js'

const compiled = ATC[0] === BINARY
const scratch = mkdtempSync(join(tmpdir(), 'atc-foundry-host-'))

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe(`atc foundry-host (${ATC.join(' ')})`, () => {
  it('answers an unknown mode with the host usage line, not an atc error', () => {
    const res = runAtc(['foundry-host', 'nope'])
    expect(res.code, res.err).toBe(2)
    expect(res.err).toContain('foundry-host: unknown mode "nope"')
    expect(res.err).not.toMatch(/unknown command/i)
    expect(res.out).toBe('')
  })

  it.skipIf(!compiled)('loads the core FFI module and reports a folder without the library', () => {
    const lib = join(scratch, 'lib')
    mkdirSync(lib)
    const res = runAtc([
      'foundry-host',
      'probe',
      '--lib',
      lib,
      '--app-data',
      join(scratch, 'app-data'),
      '--logs',
      join(scratch, 'logs'),
    ])
    expect(res.code, res.err).toBe(3)
    expect(res.err).toContain(`foundry_local does not load from ${lib}`)
    expect(res.err).not.toContain('only inside a compiled binary')
    // Printed by the core's `ffi-bun.js` itself: the bundle carries the FFI module.
    expect(res.err).toMatch(/not found: no \S*foundry_local\S* in this build/)
  })
})
