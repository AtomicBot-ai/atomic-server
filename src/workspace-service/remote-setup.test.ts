import { afterEach, describe, expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { remoteAccessSetup } from './remote-setup.js'
import { WorkspaceService } from './index.js'

const DEB_REPO = 'https://pkg.cloudflare.com/index.html'

describe('remoteAccessSetup: how to install cloudflared on the server machine', () => {
  it.each([
    ['darwin', null, ['brew install cloudflared']],
    ['win32', null, ['winget install --id Cloudflare.cloudflared']],
    ['linux', 'arch', ['sudo pacman -S cloudflared']],
    [
      'linux',
      'fedora',
      [
        'curl -fsSL https://pkg.cloudflare.com/cloudflared.repo | sudo tee /etc/yum.repos.d/cloudflared.repo',
        'sudo dnf install cloudflared',
      ],
    ],
    ['linux', null, []],
  ] as const)('on %s (%s)', (platform, family, commands) => {
    const setup = remoteAccessSetup({ platform, family, found: undefined })
    expect(setup).toMatchObject({ found: null, commands, restart: 'atc restart' })
    expect(setup.url).toMatch(/^https:\/\//)
  })

  it("adds Cloudflare's apt repository on Debian and Ubuntu, as pkg.cloudflare.com says", () => {
    const setup = remoteAccessSetup({ platform: 'linux', family: 'debian', found: undefined })
    expect(setup.url).toBe(DEB_REPO)
    expect(setup.commands).toEqual([
      'sudo mkdir -p --mode=0755 /usr/share/keyrings',
      'curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null',
      "echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list",
      'sudo apt-get update && sudo apt-get install cloudflared',
    ])
  })

  it('names the cloudflared it found, which then could not run', () => {
    expect(
      remoteAccessSetup({ platform: 'darwin', family: null, found: '/opt/homebrew/bin/cloudflared' }).found
    ).toBe('/opt/homebrew/bin/cloudflared')
  })
})

describe('the server adds the setup to the remote access status', () => {
  const cleanup: Array<() => void> = []
  afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
  const service = (status: Record<string, unknown>, withSetup = true) => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const link = fakeCoreLink()
    link.responses['GET /remote-access'] = status
    link.responses['POST /remote-access/start'] = status
    const setup = remoteAccessSetup({ platform: 'darwin', family: null, found: undefined })
    return new WorkspaceService({
      link,
      paths: tmp.paths,
      config: defaultConfig(),
      ...(withSetup ? { remoteSetup: setup } : {}),
    })
  }
  const missing = { state: 'error', error: 'cloudflared_unavailable', canStart: true, canStop: false }

  it('while the core cannot find or start cloudflared', async () => {
    const answer = (await service(missing).execute('remote.status')) as Record<string, unknown>
    expect(answer).toMatchObject({ ...missing, cloudflared: { commands: ['brew install cloudflared'] } })
    const started = (await service(missing).execute('remote.start', { request: {} })) as Record<
      string,
      unknown
    >
    expect(started['cloudflared']).toBeDefined()
  })

  it('not for any other state, nor off a server', async () => {
    const online = { state: 'online', error: null, url: 'https://a.trycloudflare.com' }
    expect(await service(online).execute('remote.status')).not.toHaveProperty('cloudflared')
    const other = { state: 'error', error: 'not_registered' }
    expect(await service(other).execute('remote.status')).not.toHaveProperty('cloudflared')
    expect(await service(missing, false).execute('remote.status')).not.toHaveProperty('cloudflared')
  })
})
