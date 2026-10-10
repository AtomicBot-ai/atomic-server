/** `start`, `stop`, `restart`, `status`: the background daemon from a command's point of view. */

import { AtcError, defineCommand } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import { CORE_VERSION } from '@atomic-chat/core'
import {
  KILL_TIMEOUT_MS,
  attachIfRunning,
  describeDaemon,
  findOutdatedOwner,
  readDaemonRecord,
  startDaemon,
  stopDaemon,
  stopOutdatedOwner,
  waitForRelease,
} from '../core-link/index.js'
import type { CoreLink, DaemonDescription, OutdatedOwner } from '../core-link/index.js'
import { formatDuration } from '../output/index.js'
import { TELEMETRY_NOTICE, takeTelemetryNotice } from '../telemetry/index.js'
import { runServerInPlace } from './daemon.js'

const attached = (ctx: CommandContext): Promise<CoreLink | undefined> =>
  attachIfRunning((o) => ctx.core.attach(o))

type Found =
  { kind: 'running'; link: CoreLink } | { kind: 'outdated'; owner: OutdatedOwner } | { kind: 'none' }

/** The running server, one another atc build left running, or none. */
async function find(ctx: CommandContext): Promise<Found> {
  try {
    const link = await attached(ctx)
    return link ? { kind: 'running', link } : { kind: 'none' }
  } catch (error) {
    if (error instanceof AtcError && error.code === 'ATC_DAEMON_OUTDATED') {
      const owner = await findOutdatedOwner(ctx.paths)
      if (owner) return { kind: 'outdated', owner }
    }
    throw error
  }
}

function killProcess(ctx: CommandContext): (pid: number) => Promise<void> {
  return async (pid) => {
    ctx.log.warn(`killing pid ${pid}`)
    if (process.platform === 'win32') await ctx.host.exec('taskkill', ['/PID', String(pid), '/T', '/F'])
    else process.kill(pid, 'SIGKILL')
  }
}

const describe = (ctx: CommandContext, link: CoreLink): Promise<DaemonDescription> =>
  describeDaemon(link, ctx.paths.daemonRecord, ctx.now)

function printStatus(ctx: CommandContext, s: DaemonDescription): void {
  ctx.out.kv([
    ['server', `running (pid ${s.pid}${s.uptime_ms !== null ? `, up ${formatDuration(s.uptime_ms)}` : ''})`],
    ['versions', `atc ${s.atc_version ?? '?'}, core ${s.core_version}`],
    ['data folder', s.data_folder],
    [
      'API',
      s.api.running
        ? `http://${s.api.host}:${s.api.port}${s.api.prefix}${s.api.requires_api_key ? ' (key required)' : ''}`
        : 'stopped',
    ],
    ['admin', s.admin_url ?? (s.state === 'starting' ? 'starting' : 'off')],
    [
      'models',
      s.sessions.length
        ? s.sessions.map((x) => `${x.model_id} (${x.provider}, :${x.port})`).join(', ')
        : 'none loaded',
    ],
  ])
}

/**
 * `start --foreground`: the server in this process, for containers and OS services. A server of
 * this build already running is an error (a service manager retries); one of another build is
 * stopped first, so an updated binary under a service takes over.
 */
async function startInForeground(values: Record<string, unknown>, ctx: CommandContext): Promise<number> {
  const found = await find(ctx)
  if (found.kind === 'running')
    throw new AtcError('ATC_DAEMON_ALREADY_RUNNING', 'A server is already running for this data folder.', {
      details: `pid ${found.link.endpoint.pid}`,
      hint: 'stop it with `atc stop` first',
    })
  if (found.kind === 'outdated') {
    ctx.log.info('the running server is another build; replacing it')
    await stopOutdatedOwner({ paths: ctx.paths, owner: found.owner, force: false, kill: false, now: ctx.now })
  }
  return runServerInPlace(values, ctx, 'foreground')
}

/** Once per data folder, on stderr: reports go out by default, and how to turn them off. */
async function noticeTelemetry(ctx: CommandContext): Promise<void> {
  if (await takeTelemetryNotice({ config: await ctx.config(), paths: ctx.paths, env: ctx.io.env }))
    ctx.out.note(TELEMETRY_NOTICE)
}

/** Stop whatever owns the folder; `stopped: false` when nothing ran. Prints nothing. */
export async function stopServer(
  ctx: CommandContext,
  flags: { force: boolean; kill: boolean }
): Promise<{ stopped: boolean; outdated?: true }> {
  const found = await find(ctx)
  if (found.kind === 'none') return { stopped: false }
  if (found.kind === 'outdated') {
    await stopOutdatedOwner({
      paths: ctx.paths,
      owner: found.owner,
      ...flags,
      now: ctx.now,
      killProcess: killProcess(ctx),
    })
    return { stopped: true, outdated: true }
  }
  const instanceId = found.link.endpoint.instanceId
  let released = await stopDaemon(found.link, ctx.paths, {
    client: 'atc stop',
    force: flags.force,
    now: ctx.now,
  })
  if (!released && flags.kill) {
    const record = await readDaemonRecord(ctx.paths.daemonRecord)
    if (record) {
      ctx.log.warn('graceful stop timed out')
      await killProcess(ctx)(record.pid)
      released = await waitForRelease(ctx.paths, instanceId, ctx.now, KILL_TIMEOUT_MS)
    }
  }
  if (!released)
    throw new AtcError('ATC_DAEMON_ALREADY_RUNNING', 'The server did not stop in time.', {
      hint: 'retry with --kill',
    })
  return { stopped: true }
}

/** Start a server of this build unless one runs; an outdated one is replaced. Prints nothing. */
export async function startServer(
  ctx: CommandContext,
  args: readonly string[]
): Promise<{ started: boolean } & DaemonDescription> {
  const found = await find(ctx)
  if (found.kind === 'running') return { started: false, ...(await describe(ctx, found.link)) }
  // The attach replaces an outdated server (and refuses while clients are attached to it).
  if (found.kind === 'outdated') ctx.log.info('the running server is another build; replacing it')
  const link = await startDaemon((o) => ctx.core.attach(o), ctx.paths, args)
  return { started: true, ...(await describe(ctx, link)) }
}

function printStarted(ctx: CommandContext, s: { started: boolean } & DaemonDescription): void {
  if (!s.started) ctx.out.note('the server is already running')
  else ctx.out.success('server started')
  printStatus(ctx, s)
  if (s.started) ctx.out.note('it keeps running after this command; `atc stop` ends it')
}

const STOP_OPTIONS = {
  force: { type: 'boolean', description: 'Stop even while other atc commands are attached' },
  kill: { type: 'boolean', description: 'After a graceful stop times out, kill the process' },
} as const

const stopFlags = (values: Record<string, unknown>) => ({
  force: values['force'] === true,
  kill: values['kill'] === true,
})

export const startCommand = defineCommand({
  name: 'start',
  summary: 'Start the server (core, API, web admin) in the background',
  group: 'server',
  description:
    'The server keeps running after this command; `atc stop` ends it. With --foreground it stays in this process instead — for Docker and systemd — and stops on SIGTERM or Ctrl+C.',
  options: {
    'admin': { type: 'boolean', description: 'Serve the web admin (--no-admin to skip)', default: true },
    'admin-port': { type: 'string', description: 'Admin port for this server', placeholder: 'port' },
    'foreground': {
      type: 'boolean',
      description: 'Stay in the foreground (containers, systemd); SIGTERM stops it',
    },
  },
  run: async (inv, ctx) => {
    if (inv.values['foreground'] === true) return startInForeground(inv.values, ctx)
    const args: string[] = []
    if (inv.values['admin'] === false) args.push('--no-admin')
    if (typeof inv.values['admin-port'] === 'string') args.push('--admin-port', inv.values['admin-port'])
    const s = await startServer(ctx, args)
    ctx.out.result(s, () => printStarted(ctx, s))
    if (s.started) await noticeTelemetry(ctx)
    return 0
  },
})

export const stopCommand = defineCommand({
  name: 'stop',
  summary: 'Stop the server: unload the models, stop the API and the admin',
  group: 'server',
  options: STOP_OPTIONS,
  run: async (inv, ctx) => {
    const r = await stopServer(ctx, stopFlags(inv.values))
    const doc = r.stopped ? r : { stopped: false, running: false }
    ctx.out.result(doc, () =>
      r.stopped ? ctx.out.success('server stopped') : ctx.out.note('the server is not running')
    )
    return 0
  },
})

export const restartCommand = defineCommand({
  name: 'restart',
  summary: 'Stop the server if it runs, then start it',
  group: 'server',
  options: STOP_OPTIONS,
  run: async (inv, ctx) => {
    const stop = await stopServer(ctx, stopFlags(inv.values))
    const s = await startServer(ctx, [])
    ctx.out.result({ ...s, stopped: stop.stopped }, () => {
      if (stop.stopped) ctx.out.success('server stopped')
      printStarted(ctx, s)
    })
    return 0
  },
})

export const statusCommand = defineCommand({
  name: 'status',
  summary: 'Show the server, the API endpoint, running models and the admin URL',
  group: 'server',
  options: { watch: { type: 'boolean', description: 'Refresh every 2 seconds until interrupted' } },
  run: async (inv, ctx) => {
    if (inv.values['watch'] === true) {
      throw new AtcError('ATC_NOT_IMPLEMENTED', '`atc status --watch` is not implemented yet.', {
        details: 'planned for iteration 2',
      })
    }
    const found = await find(ctx)
    if (found.kind === 'outdated') {
      const { lock, record } = found.owner
      const doc = {
        running: true,
        outdated: true,
        pid: lock.pid,
        core_version: lock.version,
        atc_version: record?.atc_version ?? null,
        expected_core_version: CORE_VERSION,
        data_folder: ctx.paths.dataFolder,
        admin_url: record?.admin_url ?? null,
      }
      ctx.out.result(doc, () => {
        ctx.out.kv([
          ['server', `running (pid ${lock.pid}), another build`],
          [
            'versions',
            `atc ${doc.atc_version ?? '?'}, core ${lock.version} (this atc: core ${CORE_VERSION})`,
          ],
          ['data folder', ctx.paths.dataFolder],
        ])
        ctx.out.note('`atc restart` replaces it with this build')
      })
      return 0
    }
    if (found.kind === 'none') {
      ctx.out.result({ running: false, data_folder: ctx.paths.dataFolder }, () => {
        ctx.out.kv([
          ['server', 'not running'],
          ['data folder', ctx.paths.dataFolder],
        ])
        ctx.out.note('start it with `atc start`, then `atc run <model>`')
      })
      return 0
    }
    const s = await describe(ctx, found.link)
    ctx.out.result(s, () => printStatus(ctx, s))
    return 0
  },
})
