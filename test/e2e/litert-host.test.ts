/** The core starts LiteRT-LM as `atc litert-host …`; both its dispatcher and FFI must ship in atc. */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, BINARY, runAtc } from '../helpers/binary.js'

const compiled = ATC[0] === BINARY
const scratch = mkdtempSync(join(tmpdir(), 'atc-litert-host-'))

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe(`atc litert-host (${ATC.join(' ')})`, () => {
  it.each([
    { args: ['nope'], message: 'litert-host: unknown mode "nope"' },
    { args: ['probe'], message: '--lib is required' },
  ])('passes $args to the core host parser without opening atc', ({ args, message }) => {
    const res = runAtc(['litert-host', ...args])
    expect(res.code, res.err).toBe(2)
    expect(res.err).toContain(message)
    expect(res.err).not.toMatch(/unknown command/i)
    expect(res.out).toBe('')
  })

  it.skipIf(!compiled)('loads the bundled FFI and reports a missing native library', () => {
    const build = join(scratch, 'build')
    mkdirSync(join(build, 'lib'), { recursive: true })
    const res = runAtc(['litert-host', 'probe', '--lib', build])
    expect(res.code, res.err).toBe(3)
    expect(res.err).toContain(`LiteRT-LM does not load from ${build}`)
    expect(res.err).not.toContain('only inside a compiled binary')
    // This diagnostic comes from ffi-bun.js, proving its dynamic import survived compilation.
    expect(res.err).toMatch(/litert-lm\.(dylib|so|dll).*not found/)
    expect(res.out).toBe('')
  })
})
