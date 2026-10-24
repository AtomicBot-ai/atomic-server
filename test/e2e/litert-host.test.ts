/**
 * The core's LiteRT-LM host inside atc: the core starts it as `atc litert-host …`, so the entry hands
 * that argv to `@atomic-chat/core/litert-host` before atc's own commands. The probe cases need the
 * compiled binary — only there does the core's FFI module load; the real library's case also needs
 * `LITERT_LM_TEST_LIB` (a build folder holding `lib/`).
 */
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, BINARY, runAtc } from '../helpers/binary.js'

const compiled = ATC[0] === BINARY
const realLibrary = process.env['LITERT_LM_TEST_LIB']
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

  it.skipIf(!compiled)('loads the core FFI module and reports a build without the library', () => {
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

  it.skipIf(!compiled || !realLibrary)('prints the probe answer alone on stdout', () => {
    const res = runAtc(['litert-host', 'probe', '--lib', realLibrary ?? ''])
    expect(res.code, res.err).toBe(0)
    const lines = res.out.trim().split('\n')
    expect(lines).toHaveLength(1)
    const answer = JSON.parse(lines[0] ?? '') as { version: string; abi: number; backends: string[] }
    expect(answer.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(answer.backends).toContain('cpu')
  })
})
