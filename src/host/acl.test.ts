import { describe, expect, it } from 'vitest'
import { ownerOnlyAclArgs, restrictToOwner } from './acl.js'

describe('owner-only folder ACL', () => {
  it('removes inherited entries and grants this user, SYSTEM and Administrators by SID', () => {
    expect(ownerOnlyAclArgs('C:\\atc data\\atc', 'HOST\\alice')).toEqual([
      'C:\\atc data\\atc',
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-18:(OI)(CI)F',
      '/grant:r',
      '*S-1-5-32-544:(OI)(CI)F',
      '/grant:r',
      'HOST\\alice:(OI)(CI)F',
    ])
  })

  it('runs icacls only on Windows and reports a failure instead of throwing', async () => {
    const calls: string[] = []
    const exec = async (command: string, args: readonly string[]) => {
      calls.push(`${command} ${args[0]}`)
      return { code: 5, stdout: '', stderr: 'Access is denied.', timedOut: false }
    }
    expect(await restrictToOwner('/d/atc', { platform: 'linux', user: 'u', exec })).toBeUndefined()
    expect(calls).toEqual([])
    expect(await restrictToOwner('C:\\d\\atc', { platform: 'win32', user: 'u', exec })).toBe(
      'Access is denied.'
    )
    expect(calls).toEqual(['icacls C:\\d\\atc'])
  })

  it('reads the folder back and reports entries still inherited after a successful icacls', async () => {
    const dir = 'C:\\a (I) dir\\atc'
    const listing = (aces: string) => ({ code: 0, stdout: `${dir} ${aces}\n`, stderr: '', timedOut: false })
    const owned = listing('HOST\\alice:(OI)(CI)(F)\n NT AUTHORITY\\SYSTEM:(OI)(CI)(F)')
    const inherited = listing('HOST\\alice:(OI)(CI)(F)\n BUILTIN\\Users:(I)(OI)(CI)(RX)')
    const run = (read: typeof owned) =>
      restrictToOwner(dir, {
        platform: 'win32',
        user: 'HOST\\alice',
        exec: async (_c, args) => (args.length === 1 ? read : { ...owned, stdout: 'processed 1 files' }),
      })
    expect(await run(owned)).toBeUndefined()
    expect(await run(inherited)).toMatch(/still inherits: .*BUILTIN\\Users:\(I\).*processed 1 files/s)
  })
})
