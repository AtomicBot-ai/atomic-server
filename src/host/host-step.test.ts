import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createLogger } from '../output/index.js'
import type { ElevationContext, Elevator, HostStepOutcome, HostStepResultFile } from './elevator.js'
import {
  HostStepExecutor,
  HostStepJournal,
  readResultFile,
  receiptFor,
  validateHostStep,
  writeStepReport,
} from './host-step.js'
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
  readResult: (path: string) => Promise<HostStepResultFile | undefined> = async () => completed
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
      { kind: 'result', result: { ...completed, outcome: 'reboot-required' } },
      'b'
    )
    expect(await executor.handle(operation)).toBe('posted')
    expect(posted).toEqual([
      ['op-1', expect.objectContaining({ outcome: 'reboot-required', receipt_id: 'receipt-1' })],
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

  // A prompt dismissed in the command's own terminal leaves no result file (the helper never ran): the
  // command writes the refusal beside the request, and the daemon posts it like any manual result.
  it('posts a refusal the command recorded for a manual step', async () => {
    const real = make({ kind: 'pending', instructions: 'sudo …' }, 'e', (path) => readResultFile(path))
    expect(await real.executor.handle(operation)).toBe('pending')
    const [entry] = await real.executor.pending()
    await writeStepReport(entry!.request_path, {
      schema_version: 1,
      step_id: 'step-1',
      outcome: 'declined',
      exit_code: 1,
      log_tail: 'sudo: 3 incorrect password attempts',
      finished_at: 7,
    })
    expect(await real.executor.checkPendingResults()).toBe(1)
    expect(real.posted[0]?.[1]).toMatchObject({ step_id: 'step-1', outcome: 'declined' })
  })

  it('posts a ran step again without running the elevator a second time', async () => {
    const runs: string[] = []
    let failPost = true
    const posted: string[] = []
    const elevator: Elevator = {
      select: () => 'root',
      run: async () => {
        runs.push('run')
        return { kind: 'result', result: { ...completed, outcome: 'failed' } }
      },
    }

    const journal = new HostStepJournal(join(dir, 'retry-ran', 'journal.json'))
    const custom = new HostStepExecutor({
      hostStepsDir: join(dir, 'retry-ran'),
      journal,
      dataFolder: '/d',
      instanceId: 'me',
      context,
      elevator,
      post: async () => {
        if (failPost) {
          failPost = false
          throw new Error('post failed')
        }
        posted.push('ok')
      },
      log: createLogger(() => {}, { level: 'silent' }),
      newId: () => 'receipt-2',
      now: () => 5,
      readResult: async () => undefined,
    })
    await expect(custom.handle(operation)).rejects.toThrow('post failed')
    expect(runs).toEqual(['run'])
    expect(await custom.handle(operation)).toBe('posted')
    expect(runs).toEqual(['run'])
    expect(posted).toEqual(['ok'])
  })

  it('posts a requested step from its result file without running the elevator', async () => {
    const runs: string[] = []
    const journal = new HostStepJournal(join(dir, 'requested', 'journal.json'))
    const requestPath = join(dir, 'requested', 'step-1.request.json')
    await journal.upsert({
      operation_id: 'op-1',
      step_id: 'step-1',
      step,
      request_path: requestPath,
      state: 'requested',
      updated_at: 1,
    })
    const executor = new HostStepExecutor({
      hostStepsDir: join(dir, 'requested'),
      journal,
      dataFolder: '/d',
      instanceId: 'me',
      context,
      elevator: {
        select: () => 'root',
        run: async () => {
          runs.push('run')
          return { kind: 'result', result: completed }
        },
      },
      post: async () => undefined,
      log: createLogger(() => {}, { level: 'silent' }),
      newId: () => 'receipt-3',
      now: () => 5,
      readResult: async () => completed,
    })
    expect(await executor.handle(operation)).toBe('posted')
    expect(runs).toEqual([])
  })

  it('ignores a result file whose step id does not match the request', async () => {
    const folder = join(dir, 'mismatch')
    mkdirSync(folder, { recursive: true })
    const requestPath = join(folder, 'step-1.request.json')
    await writeStepReport(requestPath, { ...completed, step_id: 'other' })
    expect(await readResultFile(requestPath)).toBeUndefined()
  })

  it('does not post again when the poll already posted during the elevator', async () => {
    const posts: string[] = []
    const journal = new HostStepJournal(join(dir, 'race', 'journal.json'))
    const holder: { executor?: HostStepExecutor } = {}
    holder.executor = new HostStepExecutor({
      hostStepsDir: join(dir, 'race'),
      journal,
      dataFolder: '/d',
      instanceId: 'me',
      context,
      elevator: {
        select: () => 'root',
        run: async () => {
          await holder.executor!.checkPendingResults()
          return { kind: 'result', result: completed }
        },
      },
      post: async () => {
        posts.push('posted')
      },
      log: createLogger(() => {}, { level: 'silent' }),
      newId: () => 'receipt-race',
      now: () => 5,
      readResult: async () => completed,
    })
    expect(await holder.executor.handle(operation)).toBe('posted')
    expect(posts).toEqual(['posted'])
    expect((await journal.load())[0]?.state).toBe('posted')
  })
})
