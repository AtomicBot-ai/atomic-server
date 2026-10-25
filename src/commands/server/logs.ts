import { inspectLock } from '@atomic-chat/core/host'
import { AtcError, defineCommand } from '../../cli/index.js'
import { followLog, readLogTail } from '../../daemon/index.js'

export const logsCommand = defineCommand({
  name: 'logs',
  summary: 'Show the server log',
  group: 'server',
  options: {
    lines: { type: 'string', short: 'n', description: 'Lines to show', default: '200', placeholder: 'count' },
    follow: { type: 'boolean', short: 'f', description: 'Keep printing new lines until interrupted' },
  },
  run: async (inv, ctx) => {
    const count = Number(inv.values['lines'])
    if (!Number.isInteger(count) || count < 1)
      throw new AtcError('ATC_USAGE', '--lines must be a positive number.')
    const follow = inv.values['follow'] === true
    if (follow && ctx.flags.json)
      throw new AtcError('ATC_USAGE', '--follow prints lines as they come; use it without --json.')
    const path = ctx.paths.daemonLog
    const { lines, offset, id } = await readLogTail(path, count)
    // A server that died while starting said why on its own stderr, not in its log.
    const stopped = (await inspectLock(ctx.paths.layout)).kind !== 'owned'
    const startup = stopped
      ? (await readLogTail(ctx.paths.daemonOutLog, 20)).lines.filter(
          (l) => !l.startsWith('{"event":"core:ready"')
        )
      : []
    ctx.out.result({ path, lines, ...(startup.length ? { last_start_output: startup } : {}) }, () => {
      if (lines.length === 0 && !follow) ctx.out.note(`no log yet at ${path}`)
      for (const line of lines) ctx.out.line(line)
      if (startup.length) {
        ctx.out.note(`the server is not running; output of its last start (${ctx.paths.daemonOutLog}):`)
        for (const line of startup) ctx.out.line(line)
      }
    })
    if (!follow) return 0
    await followLog(path, offset, {
      signal: ctx.signal,
      ...(id ? { id } : {}),
      onLines: (more) => {
        for (const line of more) ctx.out.line(line)
      },
      onReset: () => ctx.out.note('the log was replaced; following the new one'),
    })
    return 0
  },
})
