import type { RemoteAccessSetup } from '../../contract/index.js'

/** What a client shows while the server has no `cloudflared` it can run: status, steps, restart. */
export interface RemoteSetupView {
  status: string
  /** The program the server found and could not start, or null when it found none. */
  found: string | null
  intro: string
  /** Install commands for the server's system; none when the program is there and would not start. */
  commands: string[]
  url: string
  /** What picks a new program up; null when Start alone tries the one the server has again. */
  restart: string | null
}

const RUNS_THROUGH = "Remote access runs through cloudflared, Cloudflare's tunnel program."

/** The view of `remote.status` while it carries `cloudflared` (the server adds it), or null. */
export function remoteSetupView(status: Record<string, unknown>): RemoteSetupView | null {
  const setup = status['cloudflared'] as Partial<RemoteAccessSetup> | undefined
  if (status['error'] !== 'cloudflared_unavailable' || !setup || !Array.isArray(setup.commands)) return null
  const { found, commands, url = '', restart = 'atc restart' } = setup
  if (found)
    return {
      status: 'cloudflared could not start',
      found,
      intro: `${found} did not start; antivirus software may block it. Allow or reinstall it, then start remote access again.`,
      commands: [],
      url,
      // The core already has this path: once the program runs, Start works without a restart.
      restart: null,
    }
  return {
    status: 'cloudflared is not installed',
    found: null,
    intro: `${RUNS_THROUGH} ${commands.length ? 'Install' : 'Download'} it ${commands.length ? 'on' : 'for'} the server's machine:`,
    commands,
    url,
    restart,
  }
}
