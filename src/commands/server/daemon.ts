import { AtcError, defineCommand } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import { runDaemon } from '../../daemon/index.js'
import { createLogger, fileSink, tee } from '../../output/index.js'
import type { LogSink, Logger } from '../../output/index.js'

/** Hidden: the server process itself — what `start` spawns and `start --foreground` runs in place. */
export const daemonCommand = defineCommand({
  name: 'daemon',
  summary: 'Run the daemon in the foreground (started for you by other commands)',
  hidden: true,
  options: {
    'control-port': {
      type: 'string',
      description: 'Control API port (0 = free port)',
      default: '0',
      placeholder: 'port',
    },
    'control-host': { type: 'string', description: 'Control API host', placeholder: 'host' },
    'admin': { type: 'boolean', description: 'Serve the web admin', default: true },
    'admin-host': { type: 'string', description: 'Admin bind address', placeholder: 'host' },
    'admin-port': { type: 'string', description: 'Admin port (0 = random)', placeholder: 'port' },
    'telemetry': { type: 'string', description: 'on | off (default: from config)', placeholder: 'on|off' },
  },
  run: (inv, ctx) => runServerInPlace(inv.values, ctx),
})

/**
 * Run the server in this process until a signal or a control-API shutdown: what the hidden
 * `atc daemon` (spawned by `start`) and `atc start --foreground` (containers, OS services) both do.
 */
export async function runServerInPlace(
  values: Record<string, unknown>,
  ctx: CommandContext,
  mode: 'spawned' | 'foreground' = 'spawned'
): Promise<number> {
  const config = await ctx.config()
  // The server writes and rotates its own log. In the foreground the same lines also go to stderr,
  // where journald, launchd or `docker logs` collect them; spawned, stderr is `daemon.out.log`.
  const file = fileSink(ctx.paths.daemonLog, {
    maxSizeBytes: config.values.log.maxSizeMb * 1024 * 1024,
    maxFiles: config.values.log.maxFiles,
    format: 'text',
  })
  const level = ctx.log.level === 'debug' ? 'debug' : config.values.log.level
  const log = createLogger(mode === 'foreground' ? tee(file, forwardTo(ctx.log)) : file, { level })
  const port = (name: string): number | undefined => {
    const raw = values[name]
    if (typeof raw !== 'string') return undefined
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0 || n > 65535)
      throw new AtcError('ATC_USAGE', `--${name} must be a port number.`)
    return n
  }
  const telemetryFlag = values['telemetry']
  return runDaemon({
    paths: ctx.paths,
    io: ctx.io,
    config,
    host: ctx.host,
    log,
    controlPort: port('control-port') ?? 0,
    ...(typeof values['control-host'] === 'string' ? { controlHost: values['control-host'] } : {}),
    admin: {
      enabled: values['admin'] !== false && config.values.admin.autoStart,
      ...(typeof values['admin-host'] === 'string' ? { host: values['admin-host'] } : {}),
      ...(port('admin-port') !== undefined ? { port: port('admin-port') as number } : {}),
    },
    ...(telemetryFlag === 'on' || telemetryFlag === 'off' ? { telemetry: telemetryFlag === 'on' } : {}),
  })
}

/** A sink that hands each entry to another logger (the command's stderr one), keeping its scope. */
function forwardTo(log: Logger): LogSink {
  return (e) => log[e.level](e.scope ? `${e.scope}: ${e.message}` : e.message, e.fields)
}
