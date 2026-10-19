import { defineCommand } from '../cli/index.js'
import { CHECKS, coreHardware, runChecks, worstStatus } from '../doctor/index.js'
import { detectInstall } from '../update/index.js'
import { ATC_TARGET } from '../version.js'

export const doctorCommand = defineCommand({
  name: 'doctor',
  summary: 'Check the installation: folders, config, ports, PATH, GPU',
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
