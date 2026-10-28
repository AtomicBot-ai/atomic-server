import { describe, expect, it } from 'vitest'
import { findCloudflared, linuxFamily } from './cloudflared.js'

const on =
  (...paths: string[]) =>
  (path: string) =>
    paths.includes(path)

describe('findCloudflared', () => {
  it.each([
    [
      'PATH first',
      'linux',
      { PATH: '/opt/x:/usr/bin' },
      on('/opt/x/cloudflared', '/usr/bin/cloudflared'),
      '/opt/x/cloudflared',
    ],
    // A launchd job's PATH is /usr/bin:/bin:/usr/sbin:/sbin: Homebrew's folders are not on it.
    [
      'Homebrew on Apple silicon',
      'darwin',
      { PATH: '/usr/bin:/bin' },
      on('/opt/homebrew/bin/cloudflared'),
      '/opt/homebrew/bin/cloudflared',
    ],
    [
      'Homebrew on Intel',
      'darwin',
      { PATH: '/usr/bin:/bin' },
      on('/usr/local/bin/cloudflared'),
      '/usr/local/bin/cloudflared',
    ],
    ['a package on Linux', 'linux', { PATH: '' }, on('/usr/bin/cloudflared'), '/usr/bin/cloudflared'],
    [
      '~/.local/bin on Linux',
      'linux',
      { PATH: '/usr/bin' },
      on('/home/u/.local/bin/cloudflared'),
      '/home/u/.local/bin/cloudflared',
    ],
    // The MSI puts it under Program Files (64-bit or x86) and appends it to the system PATH, which a
    // server started before the install does not see.
    [
      'the MSI on Windows',
      'win32',
      { Path: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', PATHEXT: '.EXE' },
      on('C:\\Program Files\\cloudflared\\cloudflared.exe'),
      'C:\\Program Files\\cloudflared\\cloudflared.exe',
    ],
    [
      'the 32-bit MSI on Windows',
      'win32',
      { 'Path': '', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', 'PATHEXT': '.EXE' },
      on('C:\\Program Files (x86)\\cloudflared\\cloudflared.exe'),
      'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    ],
    ['nothing anywhere', 'darwin', { PATH: '/usr/bin' }, on(), undefined],
  ] as const)('finds %s', (_, platform, env, exists, expected) => {
    expect(findCloudflared({ platform, env, home: '/home/u', exists })).toBe(expected)
  })

  it('takes only the path named by ATOMIC_CLOUDFLARED_BIN, as the core does', () => {
    const env = { PATH: '/usr/bin', ATOMIC_CLOUDFLARED_BIN: ' /srv/cloudflared ' }
    const find = (exists: (path: string) => boolean) =>
      findCloudflared({ platform: 'linux', env, home: '/h', exists, present: exists })
    expect(find(on('/srv/cloudflared', '/usr/bin/cloudflared'))).toBe('/srv/cloudflared')
    expect(find(on('/usr/bin/cloudflared'))).toBeUndefined()
  })

  it('takes a named file the core would try even when it cannot be run', () => {
    const env = { PATH: '', ATOMIC_CLOUDFLARED_BIN: '/srv/cloudflared' }
    const found = findCloudflared({
      platform: 'linux',
      env,
      home: '/h',
      exists: on(),
      present: on('/srv/cloudflared'),
    })
    expect(found).toBe('/srv/cloudflared')
  })
})

describe('linuxFamily', () => {
  it.each([
    ['ID=ubuntu\nID_LIKE=debian\n', 'debian'],
    ['ID=debian\n', 'debian'],
    ['ID="linuxmint"\nID_LIKE="ubuntu debian"\n', 'debian'],
    ['ID=fedora\n', 'fedora'],
    ['ID="rocky"\nID_LIKE="rhel centos fedora"\n', 'fedora'],
    ['ID=arch\n', 'arch'],
    ['ID=endeavouros\nID_LIKE=arch\n', 'arch'],
    ['ID=alpine\n', null],
    ['', null],
  ])('reads %j as %s', (osRelease, family) => {
    expect(linuxFamily(osRelease)).toBe(family)
  })
})
