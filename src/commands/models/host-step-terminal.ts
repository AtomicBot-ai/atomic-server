/**
 * The privileged step from the command that follows the operation. The daemon has no terminal: when it
 * cannot run the step itself (no `pkexec`, not root) it journals it as manual. A command on a terminal
 * with `sudo` then runs `sudo atc host-step exec <request>` there, so the password prompt appears where
 * the person is; anywhere else it prints the exact command. Either way the daemon's poll turns the
 * result file into the receipt — and when the prompt was dismissed and the helper never ran, the command
 * writes the refusal there itself, so the operation fails as declined instead of waiting for ever.
 */

import type { EnvironmentOperation } from '@atomic-chat/core/contracts'
import type { CommandContext } from '../../cli/index.js'
import type { HostStepJournalEntry } from '../../host/index.js'
import { HostStepJournal, readResultFile, writeStepReport } from '../../host/index.js'

/** How long the command waits for the daemon to journal a step it may hand over. */
const JOURNAL_WAIT_MS = 5000
const JOURNAL_POLL_MS = 250

export function terminalHostSteps(
  ctx: CommandContext,
  options: { sleep?: (ms: number) => Promise<void> } = {}
): (op: EnvironmentOperation) => void {
  const handled = new Set<string>()
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const manual = async (stepId: string): Promise<HostStepJournalEntry | undefined> => {
    for (let waited = 0; waited <= JOURNAL_WAIT_MS; waited += JOURNAL_POLL_MS) {
      const entries = await new HostStepJournal(ctx.paths.hostStepsJournal).load()
      const entry = entries.find((e) => e.step_id === stepId)
      // `requested`: the daemon is running it (a `pkexec` prompt is open); `ran`/`posted`: done.
      if (entry && entry.state !== 'requested') return entry.state === 'pending-manual' ? entry : undefined
      await sleep(JOURNAL_POLL_MS)
    }
    return undefined
  }
  const run = async (op: EnvironmentOperation, stepId: string) => {
    const entry = await manual(stepId)
    if (!entry) return
    const strategy = ctx.host.elevator.select({ ...ctx.host.facts, inDaemon: false })
    if (strategy !== 'sudo-tty' || ctx.flags.json) {
      if (ctx.flags.json)
        ctx.io.stdout(
          `${JSON.stringify({ host_step: { operation_id: op.operation_id, step_id: stepId, instructions: entry.instructions ?? '' } })}\n`
        )
      else {
        ctx.out.line(`The server waits for a privileged step; run it as administrator:`)
        ctx.out.line(`  ${entry.instructions ?? ''}`)
      }
      return
    }
    ctx.io.stderr('Running the privileged step with sudo in this terminal.\n')
    const outcome = await ctx.host.elevator.run('sudo-tty', entry.request_path)
    if (outcome.kind === 'result' && !(await readResultFile(entry.request_path)))
      await writeStepReport(entry.request_path, { ...outcome.result, step_id: stepId })
  }
  return (op) => {
    const step = op.phase === 'preparing-host' ? op.pending_host_step : null
    if (!step || handled.has(step.step_id)) return
    handled.add(step.step_id)
    void run(op, step.step_id).catch((e: unknown) => ctx.log.warn(`privileged step: ${String(e)}`))
  }
}
