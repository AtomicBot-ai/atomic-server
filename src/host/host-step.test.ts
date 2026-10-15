import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createLogger } from '../output/index.js'
import type { ElevationContext, Elevator, HostStepOutcome, HostStepResultFile } from './elevator.js'
import { HostStepExecutor, HostStepJournal, receiptFor, validateHostStep } from './host-step.js'
import type { EnvironmentOperationView, ManagedHostReceipt, ManagedHostStep } from './managed-types.js'

const dir = mkdtempSync(join(tmpdir(), 'atc-hs-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const step: ManagedHostStep = {
  step_id: 'step-1',
  action: 'linux.install-container-runtime',
  recipe_id: 'r1',
  recipe_digest: 'sha256:a',
  parameters_digest: 'sha256:b',
  parameters: {
    user: 'alice',
    arch: 'x86_64',
    family: 'apt',
    distro_id: 'ubuntu',
    version_id: '24.04',
    components: ['docker-engine'],
  },
  nonce: 'n1',
  expected_operation_revision: 2,
}
const operation: EnvironmentOperationView = {
  operation_id: 'op-1',
  instance_id: 'me',
  revision: 2,
  phase: 'preparing-host',
  pending_host_step: step,
  completed_step_ids: [],
}
const context: ElevationContext = {
  platform: 'linux',
  isRoot: true,
  isElevatedWindows: null,
  hasTty: false,
  hasDisplay: false,
  hasPkexec: false,
  hasSudo: false,
  inDaemon: true,
}
const completed: HostStepResultFile = {
  schema_version: 1,
  step_id: 'step-1',
  outcome: 'completed',
  exit_code: 0,
  log_tail: '',
  finished_at: 6,
}

function make(
  outcome: HostStepOutcome,
  subdir: string,
  readResult: () => Promise<HostStepResultFile | undefined> = async () => completed
) {
  const posted: Array<[string, ManagedHostReceipt]> = []
  const elevator: Elevator = { select: () => 'root', run: async () => outcome }
  const executor = new HostStepExecutor({
    hostStepsDir: join(dir, subdir),
    journal: new HostStepJournal(join(dir, subdir, 'journal.json')),
    dataFolder: '/d',
    instanceId: 'me',
    context,
    elevator,
    post: async (id, receipt) => {
      posted.push([id, receipt])
    },
    log: createLogger(() => {}, { level: 'silent' }),
    newId: () => 'receipt-1',
    now: () => 5,
    readResult,
  })
  return { executor, posted }
}

describe('validateHostStep and receiptFor', () => {
  it('pins the step to the operation revision and known actions', () => {
    expect(validateHostStep(step, { revision: 2 })).toBeUndefined()
    expect(validateHostStep(step, { revision: 3 })).toMatch(/revision/)
    expect(validateHostStep({ ...step, action: 'x' as never }, { revision: 2 })).toMatch(/unknown action/)
    expect(receiptFor(step, 'completed', 'r')).toEqual({
      step_id: 'step-1',
      nonce: 'n1',
      expected_operation_revision: 2,
      recipe_digest: 'sha256:a',
      parameters_digest: 'sha256:b',
      outcome: 'completed',
      receipt_id: 'r',
    })
  })
})

describe('HostStepExecutor', () => {
  it('ignores operations of other cores and without a step', async () => {
    const { executor } = make({ kind: 'pending', instructions: 'x' }, 'a')
    expect(await executor.handle({ ...operation, instance_id: 'other' })).toBe('ignored')
    expect(await executor.handle({ ...operation, pending_host_step: null })).toBe('ignored')
    expect(await executor.handle({ ...operation, revision: 9 })).toBe('invalid')
  })

  it('runs, journals and posts the receipt, and treats a repeat as a duplicate', async () => {
    const { executor, posted } = make(
      { kind: 'result', result: { ...completed, outcome: 'relogin-required' } },
      'b'
    )
    expect(await executor.handle(operation)).toBe('posted')
    expect(posted).toEqual([
      ['op-1', expect.objectContaining({ outcome: 'relogin-required', receipt_id: 'receipt-1' })],
    ])
    expect(await executor.handle(operation)).toBe('duplicate')
  })

  it('keeps a manual step pending until a result file appears', async () => {
    const { executor, posted } = make({ kind: 'pending', instructions: 'sudo atc host-step exec x' }, 'c')
    expect(await executor.handle(operation)).toBe('pending')
    expect((await executor.pending()).map((e) => e.instructions)).toEqual(['sudo atc host-step exec x'])
    expect(await executor.checkPendingResults()).toBe(1)
    expect(posted[0]?.[1].outcome).toBe('completed')
    expect(await executor.pending()).toEqual([])
  })

  it('finishes a manual step after a restart, from the journal alone', async () => {
    const first = make({ kind: 'pending', instructions: 'sudo …' }, 'd', async () => undefined)
    expect(await first.executor.handle(operation)).toBe('pending')
    const second = make({ kind: 'pending', instructions: 'sudo …' }, 'd')
    expect(await second.executor.checkPendingResults()).toBe(1)
    expect(second.posted[0]?.[1]).toMatchObject({
      step_id: 'step-1',
      nonce: 'n1',
      recipe_digest: 'sha256:a',
      outcome: 'completed',
    })
    expect(await second.executor.handle(operation)).toBe('duplicate')
  })
})
