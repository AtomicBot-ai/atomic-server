import { describe, expect, it } from 'vitest'
import { remoteSetupView } from './remote-setup.js'

const setup = (over: Record<string, unknown> = {}) => ({
  state: 'error',
  error: 'cloudflared_unavailable',
  cloudflared: {
    found: null,
    commands: ['brew install cloudflared'],
    url: 'https://developers.cloudflare.com/x',
    restart: 'atc restart',
    ...over,
  },
})

describe('remoteSetupView: what the terminal and the web say while cloudflared is missing', () => {
  it('says it is not installed and how to install it, then to restart', () => {
    expect(remoteSetupView(setup())).toEqual({
      status: 'cloudflared is not installed',
      found: null,
      intro:
        "Remote access runs through cloudflared, Cloudflare's tunnel program. Install it on the server's machine:",
      commands: ['brew install cloudflared'],
      url: 'https://developers.cloudflare.com/x',
      restart: 'atc restart',
    })
  })

  it('points at the downloads when no command fits this system', () => {
    expect(remoteSetupView(setup({ commands: [] }))?.intro).toBe(
      "Remote access runs through cloudflared, Cloudflare's tunnel program. Download it for the server's machine:"
    )
  })

  it('names the program the server found and could not start, which Start tries again without a restart', () => {
    const view = remoteSetupView(setup({ found: '/opt/homebrew/bin/cloudflared' }))
    expect(view).toMatchObject({ status: 'cloudflared could not start', commands: [], restart: null })
    expect(view?.intro).toBe(
      '/opt/homebrew/bin/cloudflared did not start; antivirus software may block it. Allow or reinstall it, then start remote access again.'
    )
  })

  it.each([
    {},
    { state: 'online' },
    { error: 'cloudflared_unavailable' },
    { cloudflared: { commands: 'x' } },
  ])('is null for %j', (status) => {
    expect(remoteSetupView(status)).toBeNull()
  })
})
