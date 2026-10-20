/**
 * The privileged step while `atc engines install` follows the operation (spec managed-engines-server,
 * "Привилегированный шаг виден и выполним на сервере"). The daemon journals a step it cannot run as
 * manual; the command then runs it with `sudo` in its own terminal, or prints the command to run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import type { Elevator, HostStepOutcome } from '../../src/host/index.js'
import { writeStepReport } from '../../src/host/index.js'
import { DIGEST_A } from '../helpers/managed-fixtures.js'
import { managedRun } from '../helpers/managed-host.js'
import type { ManagedHost } from '../helpers/managed-host.js'
import { fakeHost } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { waitFor } from '../helpers/wait-for.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')
const err = () => t.io.err.join('')

const STEP = {
  step_id: 'host-step-1',
  action: 'linux.install-container-runtime',
  recipe_id: 'linux.install-container-runtime',
  recipe_digest: `sha256:${'1'.repeat(64)}`,
  parameters_digest: `sha256:${'2'.repeat(64)}`,
  parameters: {
    user: 'u',
    arch: 'x86_64',
    family: 'apt',
    distro_id: 'ubuntu',
    version_id: '24.04',
    components: [],
  },
  nonce: 'n',
  expected_operation_revision: 2,
}
const MANUAL = 'sudo atc host-step exec host-step-1.request.json'

/**
 * A host whose daemon could not run the step itself: once the operation waits on it, the journal says
 * `pending-manual`, and a result file beside the request is what the daemon would post as a receipt.
 */
function hostWith(elevator: Elevator): { h: ManagedHost; request: string } {
  const run = managedRun('tensorrt-llm', { deps: { host: fakeHost({ elevator }) } })
  t = run.t
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  const request = join(paths.hostStepsDir, 'host-step-1.request.json')
  run.h.onBegin = (op) => {
    mkdirSync(paths.hostStepsDir, { recursive: true })
    writeFileSync(request, '{}')
    writeFileSync(
      paths.hostStepsJournal,
      JSON.stringify([
        {
          operation_id: op.operation_id,
          step_id: STEP.step_id,
          step: STEP,
          request_path: request,
          state: 'pending-manual',
          instructions: MANUAL,
          updated_at: 1,
        },
      ])
    )
    void run.h.play(op.operation_id, [
      { phase: 'preparing-host', plan_digest: DIGEST_A, pending_host_step: STEP as never },
    ])
  }
  return { h: run.h, request }
}

/** The daemon's poll: a result file beside the request becomes the receipt, and the core moves on. */
async function daemonPostsResult(h: ManagedHost, request: string) {
  const result = request.replace(/\.request\.json$/, '.result.json')
  await waitFor(() => existsSync(result))
  const outcome = (JSON.parse(readFileSync(result, 'utf8')) as { outcome: string }).outcome
  await h.play(
    'op-tensorrt-llm',
    outcome === 'declined'
      ? [
          {
            phase: 'failed',
            pending_host_step: null,
            error: { code: 'MANAGED_ELEVATION_DECLINED', message: 'The system change was not authorized.' },
          },
        ]
      : [{ phase: 'pulling-image', pending_host_step: null }, { phase: 'ready' }]
  )
  return outcome
}

const terminalSudo = (outcome: (request: string) => Promise<HostStepOutcome>, runs: string[]): Elevator => ({
  select: (ctx) => (ctx.inDaemon ? 'manual' : 'sudo-tty'),
  run: async (strategy, request) => {
    runs.push(`${strategy} ${request}`)
    return outcome(request)
  },
})

describe('the privileged step from the command', () => {
  it('asks for sudo in this terminal and continues once the step ran', async () => {
    const runs: string[] = []
    const report = {
      schema_version: 1 as const,
      step_id: 'host-step-1',
      outcome: 'completed' as const,
      exit_code: 0,
      log_tail: '',
      finished_at: 1,
    }
    const { h, request } = hostWith(
      terminalSudo(async (path) => {
        await writeStepReport(path, report) // the helper writes its own result
        return { kind: 'result', result: report }
      }, runs)
    )
    const running = t.run(['engines', 'install', 'tensorrt-llm', '--yes'])
    expect(await daemonPostsResult(h, request)).toBe('completed')
    expect(await running).toBe(0)
    expect(runs).toEqual([`sudo-tty ${request}`])
    expect(out()).toContain('tensorrt-llm is installed and ready')
  })

  it('ends with the refusal when sudo is declined, leaving the operation to --resume', async () => {
    const runs: string[] = []
    const { h, request } = hostWith(
      terminalSudo(
        async () => ({
          kind: 'result',
          result: {
            schema_version: 1,
            step_id: '',
            outcome: 'declined',
            exit_code: 1,
            log_tail: 'sudo: 3 incorrect password attempts',
            finished_at: 1,
          },
        }),
        runs
      )
    )
    const running = t.run(['engines', 'install', 'tensorrt-llm', '--yes'])
    expect(await daemonPostsResult(h, request)).toBe('declined')
    expect(await running).toBe(1)
    expect(err()).toContain('MANAGED_ELEVATION_DECLINED')
    expect(err()).toContain('not authorized')
    expect(err()).toContain('atc engines install --resume op-tensorrt-llm')
  })

  it('without a terminal, prints the exact command and goes on once a person ran it', async () => {
    const runs: string[] = []
    const { h, request } = hostWith({
      select: () => 'manual',
      run: async (strategy) => (runs.push(strategy), { kind: 'pending', instructions: MANUAL }),
    })
    const running = t.run(['engines', 'install', 'tensorrt-llm', '--yes'])
    await waitFor(() => out().includes(MANUAL))
    await writeStepReport(request, {
      schema_version: 1,
      step_id: 'host-step-1',
      outcome: 'completed',
      exit_code: 0,
      log_tail: '',
      finished_at: 1,
    })
    expect(await daemonPostsResult(h, request)).toBe('completed')
    expect(await running).toBe(0)
    expect(runs).toEqual([])
  })
})
