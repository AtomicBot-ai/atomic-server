/**
 * `atc update`: replace this binary with a release (`src/update/apply.ts`), then restart what runs the
 * old one — the OS service when one is installed, otherwise the background server — so the new version
 * is what answers. `--check` only reports.
 */

import { AtcError, defineCommand } from '../cli/index.js'
import type { CommandContext } from '../cli/index.js'
import { attachIfRunning } from '../core-link/index.js'
import { applyUpdate, checkForUpdate, nodeUpdateFiles } from '../update/index.js'
import { ATC_TARGET, ATC_VERSION } from '../version.js'
import { startServer, stopServer } from './lifecycle.js'

/** What restarted onto the new binary: a service, the server, or nothing (and why). */
async function restartOntoNewBinary(ctx: CommandContext, force: boolean): Promise<string> {
  for (const system of [false, true]) {
    const o = {
      name: 'atc',
      command: ctx.host.selfCommand,
      dataFolder: ctx.paths.dataFolder,
      system,
      user: ctx.host.facts.username,
      logFile: '',
    }
    const state = await ctx.host.services.status(o).catch(() => undefined)
    if (state?.installed) {
      if (ctx.host.services.kind === 'task') await stopServer(ctx, { force: true, kill: false })
      await ctx.host.services.restart(o)
      return system ? 'system service' : 'service'
    }
  }
  if (!(await attachIfRunning((o) => ctx.core.attach(o)).catch(() => undefined))) return 'none'
  try {
    await stopServer(ctx, { force, kill: false })
  } catch (error) {
    if (error instanceof AtcError && error.code === 'ATC_DAEMON_ALREADY_RUNNING') return 'refused'
    throw error
  }
  await startServer(ctx, [])
  return 'server'
}

export const updateCommand = defineCommand({
  name: 'update',
  summary: 'Update atc to the latest release',
  group: 'system',
  description:
    'Downloads the release for this machine, checks it against SHA256SUMS and against the signature of the installed atc, replaces this binary, and restarts the server (or the service) on the new one.',
  options: {
    check: { type: 'boolean', description: 'Only report whether a newer release exists' },
    version: {
      type: 'string',
      description: 'Install this version instead of the latest',
      placeholder: 'x.y.z',
    },
    force: {
      type: 'boolean',
      description: 'Reinstall even when up to date; restart the server while other clients are attached',
    },
  },
  run: async (inv, ctx) => {
    const api = ctx.io.env['ATC_GITHUB_API']
    if (inv.values['check'] === true) {
      const result = await checkForUpdate(ctx.io.fetch, ATC_VERSION, undefined, api)
      ctx.out.result(result, () => {
        ctx.out.line(
          result.available
            ? `atc ${result.latest} is available (you have ${result.current}): ${result.url}`
            : `atc ${result.current} is the latest`
        )
      })
      return 0
    }
    const force = inv.values['force'] === true
    const tag = typeof inv.values['version'] === 'string' ? inv.values['version'] : undefined
    const result = await applyUpdate(
      {
        fetch: ctx.io.fetch,
        exec: ctx.host.exec,
        files: nodeUpdateFiles(ctx.io.fetch),
        platform: ctx.host.facts.platform,
        arch: ctx.host.facts.arch,
        execPath: ctx.host.selfCommand[0] ?? process.execPath,
        builtFor: ATC_TARGET,
        currentVersion: ATC_VERSION,
        now: ctx.now,
      },
      { ...(api ? { api } : {}), ...(tag ? { tag } : {}), force }
    )
    if (!result.updated) {
      ctx.out.result(result, () => ctx.out.line(`atc ${result.from} is the latest`))
      return 0
    }
    const restarted = await restartOntoNewBinary(ctx, force)
    ctx.out.result({ ...result, restarted }, () => {
      ctx.out.success(`updated atc ${result.from} → ${result.to}`)
      if (restarted === 'refused')
        ctx.out.note('other clients are attached to the server; `atc restart --force` runs the new version')
      else if (restarted !== 'none') ctx.out.note(`restarted the ${restarted} on the new version`)
    })
    return 0
  },
})
