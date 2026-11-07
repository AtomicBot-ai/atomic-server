import { defineCommand } from '../../cli/index.js'
import { runHostStepHelper, promptHostStep } from '../../host/index.js'

const exec = defineCommand({
  name: 'exec',
  summary: 'Run one privileged host step from its request file and write the result beside it',
  positionals: [{ name: 'request', description: 'Path to <step_id>.request.json', required: true }],
  options: {
    'request-sha256': { type: 'string', description: 'Bind a FastFlowLM request to its approved SHA-256' },
  },
  run: async (inv, ctx) => {
    const result = await runHostStepHelper(inv.positionals[0] as string, {
      platform: ctx.host.facts.platform,
      env: ctx.io.env,
      ...(typeof inv.values['request-sha256'] === 'string'
        ? { requestSha256: inv.values['request-sha256'] }
        : {}),
    })
    ctx.out.result(result, () =>
      ctx.out.line(`${result.step_id}: ${result.outcome}${result.log_tail ? ` — ${result.log_tail}` : ''}`)
    )
    return result.outcome === 'failed' ? 1 : 0
  },
})

/** Hidden: the privileged helper the daemon (or a person, by hand) runs with elevated rights. */
export const hostStepCommand = defineCommand({
  name: 'host-step',
  summary: 'Privileged helper for managed-runtime setup (run by the server)',
  hidden: true,
  subcommands: [
    exec,
    defineCommand({
      name: 'prompt',
      summary: 'Authorize one approved host step in the user terminal',
      positionals: [{ name: 'request', description: 'Approved host request file', required: true }],
      options: { 'request-sha256': { type: 'string', description: 'Approved request SHA-256' } },
      run: (inv, ctx) =>
        promptHostStep(inv.positionals[0]!, String(inv.values['request-sha256'] ?? ''), ctx.host.elevator),
    }),
  ],
})
