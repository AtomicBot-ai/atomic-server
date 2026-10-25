import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type { EngineVersionsResponse } from '@atomic-chat/core/contracts'
import { AtcError, defineCommand } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import type { ManagedEngineState } from '../../contract/index.js'
import { CHECKS, coreHardware, runChecks, worstStatus } from '../../doctor/index.js'
import type { ManagedFacts } from '../../doctor/index.js'
import { attachWorkspace } from '../server/control.js'

/**
 * The running server's managed engines and their environment, for doctor's checks: each managed
 * engine's state (`engines.plan` probes, changing nothing) and the environment's diagnostics. Asked
 * once; `undefined` when no server runs — doctor never starts one.
 */
export function managedFacts(ctx: CommandContext): () => Promise<ManagedFacts | undefined> {
  let asked: Promise<ManagedFacts | undefined> | undefined
  const ask = async (): Promise<ManagedFacts | undefined> => {
    let service
    try {
      service = (await attachWorkspace(ctx, false)).service
    } catch (error) {
      if (error instanceof AtcError && error.code === 'ATC_DAEMON_NOT_RUNNING') return undefined
      throw error
    }
    const { engines } = (await service.execute('engines.list')) as EngineVersionsResponse
    const managed = (engines ?? []).filter((e) => ENGINE_KINDS[e.engine] === 'managed').map((e) => e.engine)
    const states: ManagedEngineState[] = []
    for (const engine of managed)
      states.push((await service.execute('engines.plan', { engine })) as ManagedEngineState)
    const diagnostics = managed[0]
      ? ((await service
          .execute('engines.diagnostics', { engine: managed[0] })
          .catch(() => null)) as ManagedFacts['diagnostics'])
      : null
    return { engines: states, diagnostics }
  }
  return () => (asked ??= ask())
}
import { detectInstall } from '../../update/index.js'
import { ATC_TARGET } from '../../version.js'

export const doctorCommand = defineCommand({
  name: 'doctor',
  summary: 'Check the installation: folders, config, ports, PATH, GPU, managed engines',
  group: 'system',
  run: async (_inv, ctx) => {
    const config = await ctx.config()
    const results = await runChecks(CHECKS, {
      paths: ctx.paths,
      host: ctx.host,
      env: ctx.io.env,
      apiPort: config.values.api.port,
      adminPort: config.values.admin.port,
      install: await detectInstall(
        ctx.io.readFile,
        ctx.host.facts.platform,
        ctx.host.selfCommand[0] ?? process.execPath,
        ATC_TARGET
      ),
      hardware: coreHardware((o) => ctx.core.attach(o)),
      managed: managedFacts(ctx),
    })
    const worst = worstStatus(results)
    ctx.out.result({ status: worst, checks: results }, () => {
      const mark = {
        ok: ctx.colors.green('ok  '),
        warn: ctx.colors.yellow('warn'),
        fail: ctx.colors.red('FAIL'),
        skip: ctx.colors.dim('skip'),
      }
      for (const r of results) {
        ctx.out.line(`${mark[r.status]}  ${r.title}: ${r.message}`)
        if (r.hint) ctx.out.line(`      ${ctx.colors.dim(`→ ${r.hint}`)}`)
      }
    })
    return worst === 'fail' ? 1 : 0
  },
})
