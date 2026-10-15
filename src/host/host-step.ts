/**
 * The daemon's side of a privileged step: notice `pending_host_step` on an operation this core
 * owns, journal it, write the request file, get it run (or hand out the manual command), and turn
 * the result into the receipt the core verifies. The journal is written before anything runs and
 * carries the whole step, so a crash between the helper and the receipt — or a daemon restart
 * while a person runs the manual command — is repaired on the next start rather than repeated.
 */

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Logger } from '../output/index.js'
import type { ElevationContext, Elevator, HostStepRequestFile, HostStepResultFile } from './elevator.js'
import { resultPathFor } from './helper.js'
import { MANAGED_HOST_ACTIONS } from './managed-types.js'
import type {
  EnvironmentOperationView,
  HostStepOutcomeKind,
  ManagedHostReceipt,
  ManagedHostStep,
} from './managed-types.js'

export type JournalState = 'requested' | 'pending-manual' | 'ran' | 'posted'

export interface HostStepJournalEntry {
  operation_id: string
  step_id: string
  /** The whole step, so a restarted daemon can still build the receipt for a manual result. */
  step: ManagedHostStep
  request_path: string
  state: JournalState
  outcome?: HostStepOutcomeKind
  instructions?: string
  updated_at: number
}

export class HostStepJournal {
  constructor(private readonly path: string) {}

  async load(): Promise<HostStepJournalEntry[]> {
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as unknown
      return Array.isArray(raw) ? (raw as HostStepJournalEntry[]) : []
    } catch {
      return []
    }
  }

  async upsert(entry: HostStepJournalEntry): Promise<void> {
    const entries = (await this.load()).filter((e) => e.step_id !== entry.step_id)
    entries.push(entry)
    await mkdir(join(this.path, '..'), { recursive: true })
    const tmp = `${this.path}.tmp`
    await writeFile(tmp, `${JSON.stringify(entries, null, 2)}\n`)
    await rename(tmp, this.path)
  }
}

/** Why a step must not run, or undefined when it may. */
export function validateHostStep(step: ManagedHostStep, operation: { revision: number }): string | undefined {
  if (!MANAGED_HOST_ACTIONS.includes(step.action)) return `unknown action ${step.action}`
  if (step.expected_operation_revision !== operation.revision)
    return `step expects revision ${step.expected_operation_revision}, operation is at ${operation.revision}`
  if (!step.recipe_digest.startsWith('sha256:') || !step.parameters_digest.startsWith('sha256:'))
    return 'digests must be sha256'
  if (!step.nonce) return 'missing nonce'
  return undefined
}

export function receiptFor(
  step: ManagedHostStep,
  outcome: HostStepOutcomeKind,
  receiptId: string,
  logTail?: string
): ManagedHostReceipt {
  return {
    step_id: step.step_id,
    nonce: step.nonce,
    expected_operation_revision: step.expected_operation_revision,
    recipe_digest: step.recipe_digest,
    parameters_digest: step.parameters_digest,
    outcome,
    receipt_id: receiptId,
    // The step's own log: on a failure the core makes it the error's details (the cause, in words).
    ...(logTail ? { log_tail: logTail.slice(-16 * 1024) } : {}),
  }
}

export interface HostStepExecutorDeps {
  hostStepsDir: string
  journal: HostStepJournal
  dataFolder: string
  instanceId: string
  context: ElevationContext
  elevator: Elevator
  post: (operationId: string, receipt: ManagedHostReceipt) => Promise<void>
  log: Logger
  newId: () => string
  now?: () => number
  readResult?: (requestPath: string) => Promise<HostStepResultFile | undefined>
}

export type HandleOutcome = 'ignored' | 'duplicate' | 'invalid' | 'pending' | 'posted'

export class HostStepExecutor {
  private readonly now: () => number

  constructor(private readonly deps: HostStepExecutorDeps) {
    this.now = deps.now ?? Date.now
  }

  /** React to one operation state; safe to call for every `environment:operation` event. */
  async handle(operation: EnvironmentOperationView): Promise<HandleOutcome> {
    const step = operation.pending_host_step
    if (!step || operation.instance_id !== this.deps.instanceId) return 'ignored'
    const existing = (await this.deps.journal.load()).find((e) => e.step_id === step.step_id)
    if (existing && existing.state !== 'requested')
      return existing.state === 'pending-manual' ? 'pending' : 'duplicate'
    const problem = validateHostStep(step, operation)
    if (problem) {
      this.deps.log.warn(`host step ${step.step_id} refused: ${problem}`)
      return 'invalid'
    }
    const requestPath = join(this.deps.hostStepsDir, `${step.step_id}.request.json`)
    const request: HostStepRequestFile = {
      schema_version: 1,
      step_id: step.step_id,
      operation_id: operation.operation_id,
      action: step.action,
      recipe_id: step.recipe_id,
      recipe_digest: step.recipe_digest,
      parameters_digest: step.parameters_digest,
      nonce: step.nonce,
      expected_operation_revision: step.expected_operation_revision,
      data_folder: this.deps.dataFolder,
      requested_at: this.now(),
      // Verbatim: the executor recomputes `parameters_digest` from them and refuses a mismatch.
      parameters: step.parameters,
    }
    // The executor trusts only a folder its invoking user owns with mode 0700 and a request no one
    // else can write; the umask (a desktop's 002) must not decide that.
    await mkdir(this.deps.hostStepsDir, { recursive: true, mode: 0o700 })
    await chmod(this.deps.hostStepsDir, 0o700).catch(() => undefined)
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 })
    await chmod(requestPath, 0o600).catch(() => undefined)
    const base = {
      operation_id: operation.operation_id,
      step_id: step.step_id,
      step,
      request_path: requestPath,
    }
    await this.deps.journal.upsert({ ...base, state: 'requested', updated_at: this.now() })
    const strategy = this.deps.elevator.select(this.deps.context)
    this.deps.log.info(`host step ${step.step_id} (${step.action}) via ${strategy}`)
    const outcome = await this.deps.elevator.run(strategy, requestPath)
    if (outcome.kind === 'pending') {
      await this.deps.journal.upsert({
        ...base,
        state: 'pending-manual',
        instructions: outcome.instructions,
        updated_at: this.now(),
      })
      this.deps.log.warn(`host step ${step.step_id} needs elevation: ${outcome.instructions}`)
      return 'pending'
    }
    await this.deps.journal.upsert({
      ...base,
      state: 'ran',
      outcome: outcome.result.outcome,
      updated_at: this.now(),
    })
    await this.post(base, outcome.result.outcome, outcome.result.log_tail)
    return 'posted'
  }

  /** Finish steps a person ran by hand: a result file next to a pending request, journal-driven. */
  async checkPendingResults(): Promise<number> {
    let posted = 0
    for (const entry of await this.deps.journal.load()) {
      if (entry.state !== 'pending-manual') continue
      const result = await (this.deps.readResult ?? readResultFile)(entry.request_path)
      if (!result) continue
      await this.post(entry, result.outcome, result.log_tail)
      posted += 1
    }
    return posted
  }

  async pending(): Promise<HostStepJournalEntry[]> {
    return (await this.deps.journal.load()).filter((e) => e.state === 'pending-manual')
  }

  private async post(
    entry: Pick<HostStepJournalEntry, 'operation_id' | 'step_id' | 'step' | 'request_path'>,
    outcome: HostStepOutcomeKind,
    logTail?: string
  ): Promise<void> {
    await this.deps.post(entry.operation_id, receiptFor(entry.step, outcome, this.deps.newId(), logTail))
    await this.deps.journal.upsert({
      operation_id: entry.operation_id,
      step_id: entry.step_id,
      step: entry.step,
      request_path: entry.request_path,
      state: 'posted',
      outcome,
      updated_at: this.now(),
    })
  }
}

export async function readResultFile(requestPath: string): Promise<HostStepResultFile | undefined> {
  try {
    return JSON.parse(await readFile(resultPathFor(requestPath), 'utf8')) as HostStepResultFile
  } catch {
    return undefined
  }
}
