/**
 * `atc service`: the server under the OS's service manager (systemd, launchd, Task Scheduler), so it
 * starts with the machine or the session and comes back after a crash. The definitions and the steps
 * are in `src/host/service-*.ts`; this file decides the options, the privileges and the printing.
 */

import { join } from 'node:path'
import { AtcError, defineCommand } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import type { ServiceOptions } from '../../host/index.js'
import { stopServer } from '../server/lifecycle.js'

const SCOPE_OPTIONS = {
  system: { type: 'boolean', description: 'System-wide: at boot, as root/SYSTEM installs it (needs root)' },
  name: { type: 'string', description: 'Service name', placeholder: 'name', default: 'atc' },
} as const

const MANAGER_NAMES = { systemd: 'systemd', launchd: 'launchd', task: 'Task Scheduler' } as const

function serviceOptions(values: Record<string, unknown>, ctx: CommandContext): ServiceOptions {
  const name = typeof values['name'] === 'string' ? values['name'] : 'atc'
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name))
    throw new AtcError('ATC_USAGE', '--name may use letters, digits, ".", "_" and "-".')
  const user =
    (typeof values['user'] === 'string' ? values['user'] : undefined) ??
    ctx.io.env['SUDO_USER'] ??
    ctx.host.facts.username
  return {
    name,
    command: ctx.host.selfCommand,
    dataFolder: ctx.paths.dataFolder,
    system: values['system'] === true,
    user,
    logFile: join(ctx.paths.logsDir, 'service.log'),
  }
}

/** A system-wide service is written where only root (or an elevated Windows shell) may write. */
function requirePrivileges(o: ServiceOptions, ctx: CommandContext): void {
  if (!o.system) return
  const facts = ctx.host.facts
  const denied = facts.platform === 'win32' ? facts.isElevatedWindows === false : !facts.isRoot
  if (!denied) return
  throw new AtcError('ATC_ELEVATION_REQUIRED', 'A system-wide service needs administrator rights.', {
    hint:
      facts.platform === 'win32'
        ? 'run the same command in an elevated PowerShell'
        : `sudo atc service install --system --user ${o.user} --data-folder ${o.dataFolder}`,
  })
}

async function requireInstalled(o: ServiceOptions, ctx: CommandContext): Promise<void> {
  const state = await ctx.host.services.status(o)
  if (!state.installed)
    throw new AtcError('ATC_SERVICE_FAILED', `The service "${o.name}" is not installed.`, {
      hint: `install it with \`atc service install${o.system ? ' --system' : ''}\``,
    })
}

const install = defineCommand({
  name: 'install',
  summary: 'Install and start the service',
  description:
    'Runs `atc start --foreground` for this data folder under the OS service manager. It restarts the server after a failure; `atc stop` keeps it stopped until the next boot or logon.',
  options: {
    ...SCOPE_OPTIONS,
    user: { type: 'string', description: 'The account a --system service runs as', placeholder: 'user' },
  },
  run: async (inv, ctx) => {
    const o = serviceOptions(inv.values, ctx)
    requirePrivileges(o, ctx)
    // A server started by hand would hold the folder, and the service would fail to start behind it.
    const stopped = await stopServer(ctx, { force: false, kill: false })
    if (stopped.stopped) ctx.log.info('stopped the running server; the service starts it again')
    await ctx.host.services.install(o)
    const manager = ctx.host.services.kind
    const doc = {
      installed: true,
      manager,
      name: o.name,
      system: o.system,
      ...(o.system && manager !== 'task' ? { user: o.user } : {}),
      data_folder: o.dataFolder,
      definition: (await ctx.host.services.status(o)).definition,
    }
    ctx.out.result(doc, () => {
      ctx.out.success(`installed the ${MANAGER_NAMES[manager]} service "${o.name}"`)
      ctx.out.kv([
        ['definition', doc.definition],
        ['data folder', o.dataFolder],
        ...(doc.user ? [['runs as', doc.user] as [string, string]] : []),
      ])
      if (manager === 'systemd' && !o.system)
        ctx.out.note(`to keep it running after you log out: \`loginctl enable-linger ${o.user}\``)
      if (manager === 'task' && !o.system) ctx.out.note('it starts when you log on')
      ctx.out.note('`atc service status` shows whether it runs')
    })
    return 0
  },
})

const uninstall = defineCommand({
  name: 'uninstall',
  summary: 'Stop and remove the service',
  options: SCOPE_OPTIONS,
  run: async (inv, ctx) => {
    const o = serviceOptions(inv.values, ctx)
    requirePrivileges(o, ctx)
    await requireInstalled(o, ctx)
    if (ctx.host.services.kind === 'task') await stopServer(ctx, { force: true, kill: false })
    await ctx.host.services.uninstall(o)
    ctx.out.result({ uninstalled: true, name: o.name }, () =>
      ctx.out.success(`removed the service "${o.name}"`)
    )
    return 0
  },
})

const status = defineCommand({
  name: 'status',
  summary: 'Whether the service is installed and running',
  options: SCOPE_OPTIONS,
  run: async (inv, ctx) => {
    const o = serviceOptions(inv.values, ctx)
    const state = await ctx.host.services.status(o)
    const manager = ctx.host.services.kind
    const doc = { name: o.name, manager, system: o.system, ...state }
    ctx.out.result(doc, () =>
      ctx.out.kv([
        ['service', `${o.name} (${MANAGER_NAMES[manager]}${o.system ? ', system-wide' : ''})`],
        ['installed', state.installed ? 'yes' : 'no'],
        ['running', state.running === null ? 'unknown' : state.running ? 'yes' : 'no'],
        ['definition', state.definition],
      ])
    )
    return 0
  },
})

function control(action: 'start' | 'stop' | 'restart', summary: string) {
  return defineCommand({
    name: action,
    summary,
    options: SCOPE_OPTIONS,
    run: async (inv, ctx) => {
      const o = serviceOptions(inv.values, ctx)
      requirePrivileges(o, ctx)
      await requireInstalled(o, ctx)
      // A scheduled task has no signal to stop gracefully with; stop the server through its API first.
      if (action !== 'start' && ctx.host.services.kind === 'task')
        await stopServer(ctx, { force: true, kill: false })
      await ctx.host.services[action](o)
      ctx.out.result({ [action === 'stop' ? 'stopped' : 'started']: true, name: o.name }, () =>
        ctx.out.success(
          `${action === 'stop' ? 'stopped' : action === 'start' ? 'started' : 'restarted'} the service "${o.name}"`
        )
      )
      return 0
    },
  })
}

export const serviceCommand = defineCommand({
  name: 'service',
  summary: 'Run the server as an OS service (systemd, launchd, Windows task)',
  group: 'system',
  subcommands: [
    install,
    uninstall,
    status,
    control('start', 'Start the service'),
    control('stop', 'Stop the service (it stays stopped until started or the next boot)'),
    control('restart', 'Restart the service'),
  ],
})
