import { describe, expect, it } from 'vitest'
import type { ExecResult } from '../host/index.js'
import { trustDowngrade, trustOf } from './trust.js'
import type { Trust } from './trust.js'

const ok = (over: Partial<ExecResult> = {}): ExecResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
})

describe('trustDowngrade', () => {
  const team = (t: string, valid = true): Trust => ({ kind: 'codesign', valid, team: t })
  const adhoc: Trust = { kind: 'codesign', valid: true }
  const signed = (subject: string, valid = true): Trust => ({ kind: 'authenticode', valid, subject })
  const unsigned: Trust = { kind: 'unsigned' }

  it.each([
    ['same Developer ID team', team('ABC'), team('ABC'), undefined],
    ['another team', team('ABC'), team('XYZ'), 'not signed by team ABC'],
    ['ad hoc replacing a team build', team('ABC'), adhoc, 'not signed by team ABC'],
    ['unsigned replacing a team build', team('ABC'), unsigned, 'not signed by team ABC'],
    ['a team build replacing ad hoc', adhoc, team('ABC'), undefined],
    ['ad hoc replacing ad hoc', adhoc, adhoc, undefined],
    ['a broken signature', adhoc, team('ABC', false), 'does not verify'],
    ['same Authenticode subject', signed('CN=Atomic'), signed('CN=Atomic'), undefined],
    ['another subject', signed('CN=Atomic'), signed('CN=Mallory'), 'not signed by CN=Atomic'],
    ['unsigned replacing signed', signed('CN=Atomic'), unsigned, 'not signed by CN=Atomic'],
    ['signed replacing unsigned', unsigned, signed('CN=Atomic'), undefined],
    ['unsigned replacing unsigned (Linux)', unsigned, unsigned, undefined],
    [
      'invalid Authenticode still pins its subject',
      signed('CN=Atomic', false),
      unsigned,
      'not signed by CN=Atomic',
    ],
  ] as const)('%s', (_name, current, next, reason) => {
    const why = trustDowngrade(current, next)
    if (reason === undefined) expect(why).toBeUndefined()
    else expect(why).toContain(reason)
  })
})

describe('trustOf', () => {
  const exec = (results: Record<string, ExecResult>) => async (command: string, args: readonly string[]) =>
    results[`${command} ${args[0]}`] ?? ok()

  it('reads a Developer ID signature on macOS', async () => {
    const t = await trustOf(
      'darwin',
      '/bin/atc',
      exec({
        'codesign -dv': ok({
          stderr:
            'Executable=/bin/atc\nAuthority=Developer ID Application: Atomic (ABC123)\nTeamIdentifier=ABC123\n',
        }),
      })
    )
    expect(t).toEqual({ kind: 'codesign', valid: true, team: 'ABC123' })
  })

  it('reads an ad-hoc signature that does not verify', async () => {
    const t = await trustOf(
      'darwin',
      '/bin/atc',
      exec({
        'codesign --verify': ok({ code: 1, stderr: 'invalid signature' }),
        'codesign -dv': ok({ stderr: 'Signature=adhoc\nTeamIdentifier=not set\n' }),
      })
    )
    expect(t).toEqual({ kind: 'codesign', valid: false })
  })

  it('reads an unsigned binary on macOS', async () => {
    const t = await trustOf(
      'darwin',
      '/bin/atc',
      exec({ 'codesign -dv': ok({ code: 1, stderr: '/bin/atc: code object is not signed at all' }) })
    )
    expect(t).toEqual({ kind: 'unsigned' })
  })

  it.each([
    [
      'Valid\r\nCN=Atomic Chat, O=Atomic\r\n',
      { kind: 'authenticode', valid: true, subject: 'CN=Atomic Chat, O=Atomic' },
    ],
    ['HashMismatch\r\nCN=Atomic Chat\r\n', { kind: 'authenticode', valid: false, subject: 'CN=Atomic Chat' }],
    ['NotSigned\r\n\r\n', { kind: 'unsigned' }],
  ])('reads Authenticode %j', async (stdout, trust) => {
    expect(
      await trustOf('win32', 'C:\\atc.exe', exec({ 'powershell.exe -NoProfile': ok({ stdout }) }))
    ).toEqual(trust)
  })

  it('treats a codesign probe that did not run as unreadable', async () => {
    const failed = ok({ code: null, error: 'ENOENT' })
    const timedOut = ok({ timedOut: true })
    const unread = { kind: 'codesign' as const, valid: false, probeFailed: true }
    expect(await trustOf('darwin', '/bin/atc', async () => failed)).toEqual(unread)
    expect(await trustOf('darwin', '/bin/atc', async () => timedOut)).toEqual(unread)
    expect(trustDowngrade(unread, { kind: 'unsigned' })).toContain('could not be read')
    expect(trustDowngrade({ kind: 'codesign', valid: true }, unread)).toContain('could not be read')
  })

  it('treats an Authenticode probe that did not run, or empty output, as unreadable', async () => {
    const unread = { kind: 'authenticode' as const, valid: false, probeFailed: true }
    const probe = async (over: Partial<ExecResult>) => trustOf('win32', 'C:\\atc.exe', async () => ok(over))
    expect(await probe({ code: null, error: 'ENOENT' })).toEqual(unread)
    expect(await probe({ timedOut: true })).toEqual(unread)
    expect(await probe({ stdout: '' })).toEqual(unread)
    expect(trustDowngrade(unread, { kind: 'unsigned' })).toContain('could not be read')
  })

  it('has nothing to check on Linux', async () => {
    expect(await trustOf('linux', '/bin/atc', exec({}))).toEqual({ kind: 'unsigned' })
  })
})
