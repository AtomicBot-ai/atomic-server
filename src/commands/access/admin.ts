import { adminLoginUrl, ensureAdminToken, readAdminToken, rotateAdminToken } from '../../admin/index.js'
import { AtcError, defineCommand } from '../../cli/index.js'
import { readDaemonRecord, waitForDaemonReady } from '../../core-link/index.js'

const open = defineCommand({
  name: 'open',
  summary: 'Print the admin URL (with a login token) and open it in a browser',
  options: {
    open: { type: 'boolean', description: 'Open a browser (--no-open to only print)', default: true },
    host: {
      type: 'string',
      description: 'Bind address of a server started by this command',
      placeholder: 'host',
      default: '127.0.0.1',
    },
    port: {
      type: 'string',
      description: 'Admin port of a server started by this command',
      placeholder: 'port',
    },
  },
  run: async (inv, ctx) => {
    const args: string[] = []
    if (typeof inv.values['port'] === 'string') args.push('--admin-port', inv.values['port'])
    if (typeof inv.values['host'] === 'string' && inv.values['host'] !== '127.0.0.1')
      args.push('--admin-host', inv.values['host'])
    const link = await ctx.core.attach({ launch: true, daemonArgs: args })
    const record = await waitForDaemonReady(ctx.paths.daemonRecord, link.endpoint.instanceId)
    if (!record?.admin_url) {
      throw new AtcError('ATC_ADMIN_BIND_FAILED', 'The running server has no web admin.', {
        hint: 'restart it: `atc restart` (without --no-admin)',
      })
    }
    const token = await ensureAdminToken(ctx.paths.adminToken)
    const url = adminLoginUrl(record.admin_url, token)
    ctx.out.result({ url, admin_url: record.admin_url }, () => {
      ctx.out.line(url)
      ctx.out.note('the link signs the browser in; keep it private')
    })
    if (inv.values['open'] !== false && !ctx.flags.json) await ctx.io.openUrl(url)
    return 0
  },
})

const status = defineCommand({
  name: 'status',
  summary: 'Where the admin listens',
  run: async (_inv, ctx) => {
    const record = await readDaemonRecord(ctx.paths.daemonRecord)
    const url = record?.admin_url ?? null
    ctx.out.result({ running: record !== undefined, admin_url: url }, () =>
      ctx.out.line(url ?? (record ? 'the server runs without the admin' : 'the server is not running'))
    )
    return 0
  },
})

const token = defineCommand({
  name: 'token',
  summary: 'Print the admin token, or make a new one',
  options: { rotate: { type: 'boolean', description: 'Replace the token; old login links stop working' } },
  run: async (inv, ctx) => {
    const value =
      inv.values['rotate'] === true
        ? await rotateAdminToken(ctx.paths.adminToken)
        : ((await readAdminToken(ctx.paths.adminToken)) ?? (await ensureAdminToken(ctx.paths.adminToken)))
    ctx.out.result({ token: value, rotated: inv.values['rotate'] === true }, () => ctx.out.line(value))
    return 0
  },
})

export const adminCommand = defineCommand({
  name: 'admin',
  summary: 'The web admin: open it, see where it listens, manage its token',
  description:
    'The admin listens on 127.0.0.1:1338 by default. From another machine, forward the port: ssh -L 1338:127.0.0.1:1338 user@server',
  group: 'access',
  defaultSubcommand: 'open',
  subcommands: [open, status, token],
})
