/**
 * The terminal UI's side effects, in one place: it watches the daemon, follows its log, reads the
 * config and runs doctor, and it carries out the commands keys ask for — through the same
 * functions the plain commands use (`startDaemon`, `stopDaemon`, `setConfigValue`, `runChecks`),
 * so the screen never offers what a command cannot do. Everything it learns becomes an action.
 */

import { STATUS_EVENTS } from '../contract/index.js'
import type { AtcPaths, ResolvedConfig } from '../config/index.js'
import { setConfigValue, unsetConfigValue } from '../config/index.js'
import type { CoreLink, DaemonWatchState } from '../core-link/index.js'
import {
  attachIfRunning,
  readDaemonRecord,
  startDaemon,
  stopDaemon,
  watchDaemon,
} from '../core-link/index.js'
import { followLog, readLogTail } from '../daemon/index.js'
import type { CheckResult } from '../doctor/index.js'
import { errorBody } from '../errors/index.js'
import type { Logger } from '../output/index.js'
import { createLogger } from '../output/index.js'
import { configRows, describeEdit } from './model.js'
import type { Level, PendingHostStep, TuiAction } from './state.js'
import { MAX_LOG_LINES } from './state.js'

/** What the terminal UI asks the controller to do; the controller is its only side effect. */
export type TuiCommand =
  | { name: 'quit' }
  | { name: 'start' }
  | { name: 'stop' }
  | { name: 'restart' }
  | { name: 'refresh' }
  | { name: 'admin-link' }
  | { name: 'open-url'; url: string }
  | { name: 'config-set'; key: string; raw: string }
  | { name: 'config-unset'; key: string }
  | { name: 'doctor' }

export interface TuiDeps {
  paths: Pick<AtcPaths, 'daemonRecord' | 'daemonLog' | 'configFile' | 'layout'>
  /** The command context's attach, with the TUI's own logger so nothing writes under the frame. */
  attach: (options: { launch: boolean; daemonArgs?: readonly string[]; log: Logger }) => Promise<CoreLink>
  /** A fresh read of the config file and environment (not the command's cached one). */
  loadConfig: () => Promise<ResolvedConfig>
  runDoctor: () => Promise<CheckResult[]>
  pendingHostSteps: () => Promise<PendingHostStep[]>
  /** The admin URL with a login token, as `atc admin` prints it. */
  loginUrl: (adminUrl: string) => Promise<string>
  openUrl: (url: string) => Promise<void>
  now: () => Date
}

export interface TuiControllerLike {
  start(): void
  dispose(): void
  run(command: TuiCommand): Promise<void>
}

/** How often the record and pending host steps are read again while the daemon is up. */
const RECORD_POLL_MS = 2000

/** An error on one line: the message and, when there is one, the hint. */
export function oneLine(error: unknown): string {
  const body = errorBody(error)
  return body.hint ? `${body.message} — ${body.hint}` : body.message
}

export class TuiController implements TuiControllerLike {
  private readonly abort = new AbortController()
  private readonly log: Logger
  private link: CoreLink | undefined
  private snapshotSeq = 0
  private poll: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly deps: TuiDeps,
    private readonly dispatch: (action: TuiAction) => void
  ) {
    this.log = createLogger(
      (entry) =>
        this.note(
          entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'info',
          entry.message
        ),
      {
        level: 'info',
      }
    )
  }

  start(): void {
    const { signal } = this.abort
    void watchDaemon({
      attach: () => attachIfRunning((o) => this.deps.attach({ ...o, log: this.log })),
      signal,
      refreshOn: STATUS_EVENTS,
      onState: (state) => void this.onDaemon(state),
    })
    this.poll = setInterval(() => void this.refreshUp(), RECORD_POLL_MS)
    void this.followLog()
    void this.reloadConfig()
  }

  dispose(): void {
    this.abort.abort()
    if (this.poll) clearInterval(this.poll)
  }

  async run(command: TuiCommand): Promise<void> {
    try {
      await this.execute(command)
    } catch (error) {
      this.note('error', oneLine(error))
    }
  }

  private async execute(command: TuiCommand): Promise<void> {
    switch (command.name) {
      case 'quit':
        return
      case 'start':
        return this.busyWhile('starting the server', () => this.launchDaemon())
      case 'stop':
        return this.busyWhile('stopping the server', async () => void (await this.stop()))
      case 'restart':
        return this.busyWhile('restarting the server', async () => {
          if (await this.stop()) await this.launchDaemon()
        })
      case 'refresh':
        await this.reloadConfig()
        return this.refreshUp()
      case 'admin-link':
        return this.adminLink()
      case 'open-url':
        await this.deps.openUrl(command.url)
        return this.note('info', 'asked the system to open the admin in a browser')
      case 'config-set':
      case 'config-unset':
        return this.editConfig(command)
      case 'doctor': {
        this.dispatch({ type: 'doctor-running' })
        const results = await this.deps.runDoctor().catch((error: unknown) => {
          this.note('error', `doctor failed: ${oneLine(error)}`)
          return []
        })
        this.dispatch({ type: 'doctor-results', results })
        return
      }
    }
  }

  private note(level: Level, text: string): void {
    this.dispatch({ type: 'activity', line: { time: this.deps.now().getTime(), level, text } })
  }

  private async busyWhile(text: string, work: () => Promise<void>): Promise<void> {
    this.dispatch({ type: 'busy', text })
    try {
      await work()
    } finally {
      this.dispatch({ type: 'busy', text: undefined })
    }
  }

  private async launchDaemon(): Promise<void> {
    let link: CoreLink
    try {
      link = await startDaemon((o) => this.deps.attach({ ...o, log: this.log }), this.deps.paths)
    } catch (error) {
      // The daemon wrote why it gave up (a busy admin port, a bad config) to its log, not to us.
      this.note('error', `the server did not start: ${oneLine(error)} — the Logs screen (2) says why`)
      return
    }
    this.note('info', 'server started')
    // Show it now rather than on the watcher's next attach.
    await this.onDaemon({ kind: 'up', link, snapshot: await link.snapshot() })
  }

  /** Stop under an `atc tui` lease; false when it did not go in time. */
  private async stop(): Promise<boolean> {
    const link = this.link ?? (await attachIfRunning((o) => this.deps.attach({ ...o, log: this.log })))
    if (!link) {
      this.note('info', 'the server is not running')
      return true
    }
    const released = await stopDaemon(link, this.deps.paths, { client: 'atc tui', now: this.deps.now })
    if (!released) {
      this.note('error', 'The server did not stop in time. — retry with `atc stop --kill`')
      return false
    }
    this.note('info', 'server stopped')
    await this.onDaemon({ kind: 'down' })
    return true
  }

  private async onDaemon(state: DaemonWatchState): Promise<void> {
    const seq = ++this.snapshotSeq
    if (state.kind === 'down') {
      this.link = undefined
      const error = state.error === undefined ? undefined : oneLine(state.error)
      this.dispatch({ type: 'daemon', daemon: { kind: 'down', error } })
      return
    }
    this.link = state.link
    const [record, pending] = await Promise.all([
      readDaemonRecord(this.deps.paths.daemonRecord),
      this.deps.pendingHostSteps().catch(() => []),
    ])
    // A newer state (the daemon went away meanwhile) wins over this one.
    if (seq !== this.snapshotSeq || this.abort.signal.aborted) return
    this.dispatch({ type: 'daemon', daemon: { kind: 'up', snapshot: state.snapshot, record, pending } })
  }

  /** The record turns `ready` and host steps change without a core event: read them again. */
  private async refreshUp(): Promise<void> {
    const link = this.link
    if (!link) return
    try {
      await this.onDaemon({ kind: 'up', link, snapshot: await link.snapshot() })
    } catch {
      // The watcher notices a dead link on its own heartbeat.
    }
  }

  private async followLog(): Promise<void> {
    const path = this.deps.paths.daemonLog
    try {
      const { lines, offset, id } = await readLogTail(path, MAX_LOG_LINES)
      this.dispatch({ type: 'logs-reset', lines })
      await followLog(path, offset, {
        signal: this.abort.signal,
        ...(id ? { id } : {}),
        onLines: (appended) => this.dispatch({ type: 'logs-append', lines: appended }),
        onReset: () => this.dispatch({ type: 'logs-reset', lines: [] }),
      })
    } catch (error) {
      this.note('warn', `cannot read the server log: ${oneLine(error)}`)
    }
  }

  private async reloadConfig(): Promise<ResolvedConfig | undefined> {
    try {
      const resolved = await this.deps.loadConfig()
      this.dispatch({ type: 'config-rows', rows: configRows(resolved), warnings: resolved.warnings })
      return resolved
    } catch (error) {
      this.dispatch({ type: 'config-message', message: { level: 'error', text: oneLine(error) } })
      return undefined
    }
  }

  private async editConfig(
    command: Extract<TuiCommand, { name: 'config-set' | 'config-unset' }>
  ): Promise<void> {
    try {
      const current = await this.deps.loadConfig()
      const edit =
        command.name === 'config-set'
          ? await setConfigValue(this.deps.paths.configFile, current, command.key, command.raw)
          : await unsetConfigValue(this.deps.paths.configFile, current, command.key)
      await this.reloadConfig()
      const notes = [describeEdit(edit.key, edit.value)]
      if (edit.overriddenByEnv) notes.push('an environment variable overrides it')
      else if (this.link) notes.push('restart the server (R on Overview) to apply')
      this.dispatch({
        type: 'config-message',
        message: { level: edit.overriddenByEnv ? 'warn' : 'info', text: notes.join(' — ') },
      })
    } catch (error) {
      this.dispatch({ type: 'config-message', message: { level: 'error', text: oneLine(error) } })
    }
  }

  private async adminLink(): Promise<void> {
    const record = await readDaemonRecord(this.deps.paths.daemonRecord)
    if (!record?.admin_url) {
      const error = 'The running server has no web admin. — restart it: `atc restart` (without --no-admin)'
      this.dispatch({ type: 'overlay', overlay: { kind: 'admin-link', url: undefined, error } })
      return
    }
    const url = await this.deps.loginUrl(record.admin_url)
    this.dispatch({ type: 'overlay', overlay: { kind: 'admin-link', url, error: undefined } })
  }
}
