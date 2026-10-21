/** `atc status` with a managed-engine operation waiting on the server (spec managed-engines-server). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { operation } from '../helpers/managed-fixtures.js'
import { managedRun } from '../helpers/managed-host.js'
import type { TestRun } from '../helpers/test-context.js'
import { atcPathsFor } from '../../src/config/index.js'

let t: TestRun
afterEach(() => t?.cleanup())
const out = () => t.io.out.join('')

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
  expected_operation_revision: 3,
}

/** The daemon's journal: a step it could not run, and one a person already ran. */
function journal(path: string, command: string) {
  mkdirSync(dirname(path), { recursive: true })
  const entry = (step_id: string, state: string) => ({
    operation_id: 'op-tensorrt-llm',
    step_id,
    step: { ...STEP, step_id },
    request_path: `/data/atc/run/host-steps/${step_id}.request.json`,
    state,
    instructions: command,
    updated_at: 1,
  })
  writeFileSync(
    path,
    JSON.stringify([entry('host-step-0', 'posted'), entry('host-step-1', 'pending-manual')])
  )
}

describe('atc status and managed operations', () => {
  it('shows the privileged step the server waits on, with the exact command, and the operation with its phase', async () => {
    const run = managedRun('tensorrt-llm')
    t = run.t
    run.h.set(operation('tensorrt-llm', 'preparing-host', { pending_host_step: STEP as never }))
    const command = 'sudo /usr/local/bin/atc host-step exec /data/atc/run/host-steps/host-step-1.request.json'
    journal(tmpPaths(t).hostStepsJournal, command)
    expect(await t.run(['status'])).toBe(0)
    expect(out()).toContain('tensorrt-llm setup: Waiting for the privileged step')
    expect(out()).toContain(command)
    expect(out()).not.toContain('host-step-0')
    t.io.out.length = 0
    expect(await t.run(['status', '--json'])).toBe(0)
    const doc = JSON.parse(out()) as {
      pending_host_steps: Array<{ step_id: string; operation_id: string; instructions: string }>
      environment_operations: Array<{ operation_id: string; engine: string; kind: string; phase: string }>
    }
    expect(doc.pending_host_steps).toEqual([
      expect.objectContaining({
        step_id: 'host-step-1',
        operation_id: 'op-tensorrt-llm',
        instructions: command,
      }),
    ])
    expect(doc.environment_operations).toEqual([
      expect.objectContaining({
        operation_id: 'op-tensorrt-llm',
        engine: 'tensorrt-llm',
        kind: 'setup',
        phase: 'preparing-host',
      }),
    ])
  })

  it('shows nothing of a step whose operation moved on', async () => {
    const run = managedRun('tensorrt-llm')
    t = run.t
    run.h.set(operation('tensorrt-llm', 'pulling-image'))
    journal(tmpPaths(t).hostStepsJournal, 'sudo atc host-step exec x')
    expect(await t.run(['status', '--json'])).toBe(0)
    const doc = JSON.parse(out()) as { pending_host_steps: unknown[]; environment_operations: unknown[] }
    expect(doc.pending_host_steps).toEqual([])
    expect(doc.environment_operations).toHaveLength(1)
  })
})

/** The paths of the run's data folder, as the command resolves them. */
function tmpPaths(run: TestRun) {
  return atcPathsFor(run.io.env['ATC_DATA_FOLDER'] as string)
}
