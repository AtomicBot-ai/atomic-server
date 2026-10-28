/**
 * The server's own look at releases, so the terminal UI and the web admin can say a newer atc is out:
 * once after start and once a day after (`update.checkOnStart`), through the server's `fetch`. A look
 * that fails changes nothing and says so only in the log; nothing here throws.
 */

import type { WorkspaceAtc, WorkspaceUpdate } from '../contract/index.js'
import { AtcError } from '../errors/index.js'
import { packageUpgradeHint } from './install-source.js'
import type { InstallSource } from './install-source.js'
import { fetchLatestRelease } from './release.js'
import { isNewer } from './semver.js'

export const RELEASE_CHECK_INTERVAL_MS = 24 * 60 * 60_000
/** The first look waits for the server to be ready and its API up; nothing here is urgent. */
export const RELEASE_CHECK_DELAY_MS = 15_000

export interface ReleaseWatchOptions {
  fetch: typeof fetch
  /** The running atc's version. */
  current: string
  /** What installs a release here (`installCommand`); null when nothing does. */
  command: string | null
  /** The GitHub API's base URL (`ATC_GITHUB_API`). */
  api?: string | undefined
  now?: () => number
  log?: (message: string) => void
  delayMs?: number
  intervalMs?: number
}

export class ReleaseWatch {
  private update: WorkspaceUpdate | null = null
  private checkedAt: number | null = null
  private timers: Array<ReturnType<typeof setTimeout>> = []

  constructor(private readonly options: ReleaseWatchOptions) {}

  /** Looks after `delayMs`, then every `intervalMs`, until `stop`; never holds the process open. */
  start(): void {
    if (this.timers.length) return
    const first = setTimeout(() => {
      void this.check()
      const every = setInterval(() => void this.check(), this.options.intervalMs ?? RELEASE_CHECK_INTERVAL_MS)
      every.unref?.()
      this.timers.push(every)
    }, this.options.delayMs ?? RELEASE_CHECK_DELAY_MS)
    first.unref?.()
    this.timers.push(first)
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
  }

  /** One look now: what the view says afterwards. */
  async check(): Promise<WorkspaceAtc> {
    try {
      const latest = await fetchLatestRelease(this.options.fetch, undefined, this.options.api)
      this.update = isNewer(latest.version, this.options.current)
        ? { version: latest.version, url: latest.url, command: this.options.command }
        : null
      this.checkedAt = (this.options.now ?? Date.now)()
    } catch (error) {
      const details = error instanceof AtcError && error.details ? ` (${error.details})` : ''
      this.options.log?.(`release check: ${error instanceof Error ? error.message : String(error)}${details}`)
    }
    return this.view()
  }

  view(): WorkspaceAtc {
    return { version: this.options.current, checked_at: this.checkedAt, update: this.update }
  }
}

/** What installs a release on this machine: the package manager's command, `atc update`, or nothing. */
export function installCommand(
  source: InstallSource | undefined,
  builtFor: string | undefined
): string | null {
  return source ? packageUpgradeHint(source) : builtFor ? 'atc update' : null
}
