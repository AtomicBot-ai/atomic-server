import { chmod, mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fastFlowLmHostRequest, fastFlowLmHostReceipt } from '@atomic-chat/core/client'
import type { FastFlowLmOperation } from '@atomic-chat/core/contracts'
import { resultPathFor } from '@atomic-chat/core/host'
import type { CoreLink } from '../core-link/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import type { ElevationContext, Elevator } from './elevator.js'

export interface FlmStepEntry {
  operation_id: string
  step_id: string
  request_path: string
  sha256: string
  instructions: string
  updated_at: number
}
function liveStep(entry: FlmStepEntry, operations: FastFlowLmOperation[]) {
  return operations.some(
    (op) =>
      op.operation_id === entry.operation_id &&
      op.state === 'preparing-host' &&
      op.reason !== 'cancellation-requested' &&
      op.pending_host_step?.step_id === entry.step_id
  )
}
/** The server and a foreground CLI share durable files and an exclusive launch marker, never replaying an installer. */
export class FastFlowLmHostSteps {
  private busy = false
  readonly directory: string
  constructor(
    private d: {
      atcDir: string
      dataFolder: string
      link: Pick<CoreLink, 'request'>
      elevator: Elevator
      context: ElevationContext
    }
  ) {
    this.directory = join(d.atcDir, 'fastflowlm-host-steps')
  }
  async pending() {
    const entries = await FastFlowLmHostSteps.pending(this.d.atcDir)
    const operations = await Promise.all(
      [...new Set(entries.map((e) => e.operation_id))].map((id) =>
        this.d.link.request<FastFlowLmOperation>(
          'GET',
          '/runtimes/fastflowlm/operations/' + encodeURIComponent(id)
        )
      )
    )
    return entries.filter((entry) => liveStep(entry, operations))
  }
  static async pending(atcDir: string, operations?: FastFlowLmOperation[]): Promise<FlmStepEntry[]> {
    const directory = join(atcDir, 'fastflowlm-host-steps')
    const names = await readdir(directory).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return []
      throw e
    })
    const entries = await Promise.all(
      names
        .filter((n) => n.endsWith('.journal.json'))
        .map((n) => readDocument<FlmStepEntry | null>(join(directory, n), null))
    )
    return entries.filter(
      (v): v is FlmStepEntry => !!v && !!v.instructions && (!operations || liveStep(v, operations))
    )
  }
  async poll() {
    if (this.busy) return
    this.busy = true
    try {
      const operations = await this.d.link.request<FastFlowLmOperation[]>(
        'GET',
        '/runtimes/fastflowlm/operations'
      )
      if (Array.isArray(operations)) for (const op of operations) await this.handle(op)
    } finally {
      this.busy = false
    }
  }
  async handle(operation: FastFlowLmOperation) {
    if (operation.state !== 'preparing-host') return
    let op = operation
    const base = '/runtimes/fastflowlm/operations/' + encodeURIComponent(op.operation_id)
    let claimedHere = false
    if (!op.pending_host_step && op.reason !== 'cancellation-requested') {
      await mkdir(this.directory, { recursive: true, mode: 0o700 })
      await chmod(this.directory, 0o700)
      await writeDocument(join(this.directory, encodeURIComponent(op.operation_id) + '.intent.json'), {
        operation_id: op.operation_id,
        expected_revision: op.revision,
      })
      op = await this.d.link.request<FastFlowLmOperation>('POST', base + '/claim-host-step', {
        expected_revision: op.revision,
      })
      claimedHere = true
    }
    const step = op.pending_host_step
    if (!step) return
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(step.step_id)) throw new Error('Invalid host step ID.')
    const requestPath = join(this.directory, step.step_id + '.request.json')
    const journal = join(this.directory, step.step_id + '.journal.json')
    const resultPath = resultPathFor(requestPath)!
    const postResult = async () => {
      const text = await readFile(resultPath, 'utf8').catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return null
        throw e
      })
      if (text === null) return false
      const receipt = fastFlowLmHostReceipt(op, 'atc-' + step.step_id, JSON.parse(text))
      try {
        await this.d.link.request('POST', base + '/host-step-receipt', receipt)
      } catch (e) {
        const current = await this.d.link.request<FastFlowLmOperation>('GET', base)
        if (current.pending_host_step?.step_id === step.step_id) throw e
      }
      const saved = await readDocument<FlmStepEntry | null>(journal, null)
      if (saved) await writeDocument(journal, { ...saved, instructions: '' })
      return true
    }
    if (await postResult()) return
    if (op.reason === 'cancellation-requested') return
    const binding = await fastFlowLmHostRequest(op, this.d.dataFolder)
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
    const localRequest = await readFile(requestPath, 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return null
      throw e
    })
    if (!claimedHere && localRequest === null) {
      await writeDocument(journal, {
        operation_id: op.operation_id,
        step_id: step.step_id,
        request_path: requestPath,
        sha256: binding.sha256,
        updated_at: Date.now(),
        instructions:
          'This host step was already claimed without a local launch record. Wait for its helper result. If helper status is unknown, reboot the host, then resume preparation.',
      } satisfies FlmStepEntry)
      return
    }
    try {
      await writeFile(requestPath, binding.text, { flag: 'wx', mode: 0o600 })
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      if ((await readFile(requestPath, 'utf8')) !== binding.text)
        throw new Error('FastFlowLM host request changed after approval.')
    }
    const entry: FlmStepEntry = {
      operation_id: op.operation_id,
      step_id: step.step_id,
      request_path: requestPath,
      sha256: binding.sha256,
      instructions: '',
      updated_at: Date.now(),
    }
    const alreadyLaunched = () =>
      readFile(requestPath + '.launch').then(
        () => true,
        (e: NodeJS.ErrnoException) => {
          if (e.code === 'ENOENT') return false
          throw e
        }
      )
    const waiting = () =>
      writeDocument(journal, {
        ...entry,
        instructions:
          'This host step was already launched. Wait for its helper result. If helper status is unknown, reboot the host, then resume preparation.',
      })
    if (await alreadyLaunched()) {
      await waiting()
      return
    }
    const strategy = this.d.elevator.select({ ...this.d.context, allowTerminalPrompt: true })
    if (strategy === 'manual') {
      const pending =
        step.action === 'linux.configure-runtime-memlock'
          ? {
              kind: 'pending' as const,
              instructions:
                'Authorization is required on this server. Open its terminal UI, select FastFlowLM in Engines, and choose Authorize preparation.',
            }
          : await this.d.elevator.run(strategy, requestPath, binding.sha256)
      if (pending.kind === 'pending')
        await writeDocument(journal, { ...entry, instructions: pending.instructions })
      if (await alreadyLaunched()) await waiting()
      return
    }
    let lock
    try {
      lock = await open(requestPath + '.launch', 'wx', 0o600)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        await waiting()
        return
      }
      throw e
    }
    await lock.close()
    await writeDocument(journal, entry)
    const outcome = await this.d.elevator.run(strategy, requestPath, binding.sha256)
    if (await postResult()) return
    if (outcome.kind === 'pending') {
      await writeDocument(journal, { ...entry, instructions: outcome.instructions })
      return
    }
    // No helper result: only the trusted launcher can report a denied or failed elevation.
    const declined = outcome.result.outcome === 'declined' && step.action === 'windows.install-amd-npu'
    const result = {
      schema_version: 1,
      ...step,
      operation_id: op.operation_id,
      error_code: null,
      outcome: declined ? 'declined' : 'failed',
      exit_code: declined ? 1223 : outcome.result.exit_code || null,
      log_tail: outcome.result.log_tail,
      finished_at: Date.now(),
    }
    await writeDocument(resultPath, result)
    await postResult()
  }
}
