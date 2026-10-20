/**
 * A managed-engine core for command tests: the routes `atc` calls for one environment, answered from
 * state the test sets, and operations the test moves through their phases. Every change of an
 * operation is what the real core does with it: the snapshot holds it, `GET` answers it and
 * `environment:operation` publishes it.
 */
import { AtomicCoreError } from '@atomic-chat/core'
import type {
  EngineVersions,
  EnvironmentOperation,
  EnvironmentSnapshot,
  RequirementPlan,
} from '@atomic-chat/core/contracts'
import type { FakeCoreLink } from './fake-core-link.js'
import { environment, operation } from './managed-fixtures.js'

export interface ManagedHost {
  env: EnvironmentSnapshot
  plans: Record<string, RequirementPlan>
  versions: Partial<EngineVersions>[]
  operations: Map<string, EnvironmentOperation>
  begun: Array<Record<string, unknown>>
  resumed: Array<{ operation_id: string; body: Record<string, unknown> }>
  /** What the core does after a `begin`; by default nothing more. */
  onBegin: (op: EnvironmentOperation, body: Record<string, unknown>) => void
  /** What the core does after a `resume`; by default nothing more. */
  onResume: (op: EnvironmentOperation, body: Record<string, unknown>) => void
  /** Hold `op` as the core's current state of it, and publish it. */
  set(op: EnvironmentOperation): void
  /** Move an operation through `phases`, one per few milliseconds, each a new revision. */
  play(id: string, steps: Array<Partial<EnvironmentOperation>>): Promise<void>
}

export function managedHost(link: FakeCoreLink, env: EnvironmentSnapshot = environment()): ManagedHost {
  const host: ManagedHost = {
    env,
    plans: {},
    versions: [],
    operations: new Map(),
    begun: [],
    resumed: [],
    onBegin: () => {},
    onResume: () => {},
    set(op) {
      host.operations.set(op.operation_id, op)
      link.snapshotValue = {
        ...link.snapshotValue,
        environments: [host.env],
        environment_operations: [...host.operations.values()],
      }
      link.responses[`GET /environments/operations/${op.operation_id}`] = () =>
        host.operations.get(op.operation_id)
      // As the core's reducer (`state.ts`): an approval or a resume looks at the machine again first.
      link.responses[`POST /environments/operations/${op.operation_id}/resume`] = (body: unknown) => {
        const b = body as { expected_revision: number; approved_plan_digest?: string }
        const current = host.operations.get(op.operation_id)!
        if (b.expected_revision !== current.revision)
          return new AtomicCoreError('MANAGED_REVISION_CONFLICT', 'The operation has moved on.')
        const waiting = ['failed', 'cancelled', 'relogin-required', 'reboot-required']
        if (current.phase === 'awaiting-consent') {
          if (!b.approved_plan_digest)
            return new AtomicCoreError(
              'MANAGED_CONSENT_REQUIRED',
              'This operation needs the plan to be approved.'
            )
        } else if (!waiting.includes(current.phase))
          return new AtomicCoreError('MANAGED_OPERATION_CONFLICT', `${current.phase} is already running`)
        host.resumed.push({ operation_id: op.operation_id, body: b as Record<string, unknown> })
        const next: EnvironmentOperation = {
          ...current,
          phase: 'checking',
          revision: current.revision + 1,
          error: null,
          ...(b.approved_plan_digest ? { approved_plan_digest: b.approved_plan_digest as never } : {}),
        }
        host.set(next)
        host.onResume(next, b as Record<string, unknown>)
        return next
      }
      link.responses[`POST /environments/operations/${op.operation_id}/cancel`] = () =>
        host.operations.get(op.operation_id)
      link.emit({ id: `fake:${op.revision}`, event: 'environment:operation', data: op })
    },
    async play(id, steps) {
      for (const step of steps) {
        await new Promise((r) => setTimeout(r, 5))
        const current = host.operations.get(id)!
        host.set({ ...current, ...step, revision: current.revision + 1 })
      }
    },
  }
  link.snapshotValue = { ...link.snapshotValue, environments: [env], environment_operations: [] }
  link.responses['GET /environments'] = () => ({ environments: [host.env] })
  link.responses['POST /environments/probe'] = (body: unknown) => {
    const engine = (body as { target: { engine_id: string } }).target.engine_id
    return host.plans[engine] ?? new Error(`no plan for ${engine}`)
  }
  link.responses['POST /engines/versions'] = () => ({
    engines: host.versions.map((v) => ({ builds: [], active: null, update: { needed: false }, ...v })),
  })
  link.responses[`POST /environments/${env.environment_id}/operations`] = (body: unknown) => {
    const b = body as Record<string, unknown>
    host.begun.push(b)
    const engine = (b['target'] as { engine_id: string }).engine_id
    const existing = [...host.operations.values()].find((o) => o.request_id === b['request_id'])
    if (existing) return existing
    const op = operation(engine, 'checking', {
      request_id: String(b['request_id']),
      kind: b['kind'] as EnvironmentOperation['kind'],
      revision: 1,
      plan_digest: null,
      approved_plan_digest: (b['approved_plan_digest'] as never) ?? null,
    })
    host.set(op)
    host.onBegin(op, b)
    return op
  }
  return host
}
