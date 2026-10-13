import { describe, expect, it } from 'vitest'
import { icaclsPath, ownerOnlyAclArgs, restrictToOwner } from './acl.js'

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
    expect(
      await restrictToOwner('C:\\d\\atc', { platform: 'win32', user: 'u', exec, systemRoot: 'D:\\Win\\' })
    ).toBe('Access is denied.')
    expect(calls).toEqual(['D:\\Win\\System32\\icacls.exe C:\\d\\atc'])
    expect(icaclsPath(undefined)).toBe('C:\\Windows\\System32\\icacls.exe')
  })

  it('removes the broad groups by SID, then reads the folder back for anyone else left', async () => {
    const dir = 'C:\\a (I) dir\\atc'
    const listing = (aces: string[]) => ({
      code: 0,
      stdout: `${dir} ${aces.join('\n      ')}\n\nSuccessfully processed 1 files; Failed processing 0 files\n`,
      stderr: '',
      timedOut: false,
    })
    const owned = listing([
      'HOST\\alice:(OI)(CI)(F)',
      'NT AUTHORITY\\SYSTEM:(OI)(CI)(F)',
      'BUILTIN\\Administrators:(OI)(CI)(F)',
    ])
    // What the windows-11-arm runner listed: no (I), but the drive's groups as the folder's own.
    const explicit = listing([
      'NT AUTHORITY\\Authenticated Users:(M)',
      'HOST\\alice:(OI)(CI)(F)',
      'NT AUTHORITY\\SYSTEM:(OI)(CI)(F)',
      'BUILTIN\\Administrators:(OI)(CI)(F)',
      'BUILTIN\\Users:(OI)(CI)(RX)',
    ])
    const inherited = listing(['HOST\\alice:(OI)(CI)(F)', 'BUILTIN\\Users:(I)(OI)(CI)(RX)'])
    const run = async (read: typeof owned) => {
      const calls: string[][] = []
      const result = await restrictToOwner(dir, {
        platform: 'win32',
        user: 'HOST\\alice',
        exec: async (_c, args) => {
          calls.push([...args])
          return args.length === 1 ? read : { ...owned, stdout: 'processed 1 files' }
        },
      })
      return { result, calls }
    }
    const ok = await run(owned)
    expect(ok.result).toBeUndefined()
    expect(ok.calls[1]).toEqual([dir, '/remove:g', '*S-1-1-0', '*S-1-5-11', '*S-1-5-32-545', '*S-1-3-0'])
    expect((await run(explicit)).result).toMatch(
      /still grants more .*Authenticated Users:\(M\).*BUILTIN\\Users/
    )
    expect((await run(inherited)).result).toMatch(/still grants more .*BUILTIN\\Users:\(I\)/)
    // Nothing listed, or UTF-16: not taken for an owner-only folder.
    expect((await run({ ...owned, stdout: '' })).result).toMatch(/did not list the folder/)
    const utf16 = { ...explicit, stdout: [...explicit.stdout].join('\0') }
    expect((await run(utf16)).result).toMatch(/still grants more/)
  })
})
