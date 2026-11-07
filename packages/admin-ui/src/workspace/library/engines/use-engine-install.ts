import { useEffect, useRef, useSyncExternalStore } from 'react'
import { describeError } from '@/services/admin-api'
import { record, text } from '../../types'
import type { Execute, RecordValue } from '../../types'
import type { Workspace } from '../../useWorkspace'

type State = {
  busy: boolean
  taskId: string
  stage: 'installing' | 'preparing' | null
  error: string
  runtime: boolean
  revision: number
  receipt: RecordValue | null
  receiptSnapshot: Workspace['snapshot']
}
function createOperation() {
  let state: State = {
    busy: false,
    taskId: '',
    stage: null,
    error: '',
    runtime: false,
    revision: 0,
    receipt: null,
    receiptSnapshot: null,
  }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next: Partial<State>) {
      state = { ...state, ...next }
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
// Acknowledged queue receipts bridge the gap until the next server snapshot, including panel reopen.
const operations = new WeakMap<Execute, Map<string, ReturnType<typeof createOperation>>>()
function operationFor(execute: Execute, engine: string) {
  let engines = operations.get(execute)
  if (!engines) operations.set(execute, (engines = new Map()))
  let operation = engines.get(engine)
  if (!operation) engines.set(engine, (operation = createOperation()))
  return operation
}
const finished = new Set(['ready', 'failed', 'interrupted', 'cancelled'])
const jobId = (job: RecordValue) => text(job.taskId ?? job.id, '')

export function useEngineInstall(w: Pick<Workspace, 'execute' | 'snapshot'>, engine: string) {
  const operation = operationFor(w.execute, engine)
  const state = useSyncExternalStore(operation.subscribe, operation.get)
  const jobs = (w.snapshot?.downloads ?? []).map(record)
  const receipt = state.receipt
  const snapshotRef = useRef(w.snapshot)
  snapshotRef.current = w.snapshot
  // A retry can reuse the same job ID; a pre-ack snapshot must not resurrect its old failure.
  const observed =
    receipt && w.snapshot !== state.receiptSnapshot
      ? jobs.find(
          (row) =>
            jobId(row) === jobId(receipt) && Number(row.updated_at ?? 0) >= Number(receipt.updated_at ?? 0)
        )
      : undefined
  const relevant = jobs
    .filter((row) => row.kind === 'engine' && row.engine === engine)
    .sort((a, b) => Number(b.updated_at ?? b.created_at ?? 0) - Number(a.updated_at ?? a.created_at ?? 0))
  const queued =
    relevant.find((row) => !finished.has(String(row.stage))) ??
    (receipt && !finished.has(String((observed ?? receipt).stage)) ? (observed ?? receipt) : null)
  const queuedId = queued ? jobId(queued) : ''
  useEffect(() => {
    if (observed && observed !== operation.get().receipt) operation.set({ receipt: observed })
    if (queuedId && !state.busy && operation.get().error) operation.set({ error: '' })
  }, [observed, queuedId, operation, state.busy])
  const latest = relevant[0] ?? observed ?? receipt
  const terminal = !queued && latest && finished.has(String(latest.stage)) ? latest : null
  const queuedError =
    !state.busy && terminal && ['failed', 'interrupted', 'cancelled'].includes(String(terminal.stage))
      ? text(
          terminal.error,
          terminal.stage === 'cancelled' ? 'Installation was cancelled.' : 'Engine installation failed.'
        )
      : ''
  const run = async (
    work: (taskId: string, preparing: () => void) => Promise<unknown>,
    installing = false
  ) => {
    const current = operation.get()
    if (current.busy || queuedId || (current.receipt && !finished.has(String(current.receipt.stage)))) return
    const taskId = crypto.randomUUID()
    operation.set({
      busy: true,
      runtime: installing,
      taskId,
      stage: installing ? 'installing' : null,
      error: '',
      receipt: null,
      receiptSnapshot: null,
    })
    try {
      await work(taskId, () => operation.set({ stage: 'preparing' }))
    } catch (error) {
      operation.set({ error: describeError(error) })
    } finally {
      operation.set({ busy: false, stage: null, revision: operation.get().revision + 1 })
    }
  }
  const enqueue = () =>
    run(async () => {
      const receipt = record(await w.execute('engines.enqueue', { engine }))
      if (!jobId(receipt) || !receipt.stage)
        throw new Error('The server did not confirm the installation. Check Downloads before retrying.')
      operation.set({ receipt, receiptSnapshot: snapshotRef.current })
    }, true)
  return {
    busy: state.busy || Boolean(queuedId),
    error: (state.runtime ? state.error : '') || queuedError,
    actionError: state.runtime ? '' : state.error,
    runtimeBusy: (state.busy && state.runtime) || Boolean(queuedId),
    hasQueuedFailure: Boolean(queuedError),
    refreshKey: `${state.revision}:${queuedId}:${terminal?.stage ?? ''}`,
    installation:
      state.stage === 'preparing'
        ? { taskId: state.taskId, stage: 'preparing' as const }
        : queuedId
          ? { taskId: queuedId, stage: 'installing' as const, phase: text(queued!.stage, 'queued') }
          : state.stage
            ? { taskId: state.taskId, stage: state.stage }
            : null,
    downloads:
      receipt && !observed ? [...(w.snapshot?.downloads ?? []), receipt] : (w.snapshot?.downloads ?? []),
    run,
    enqueue,
  }
}
