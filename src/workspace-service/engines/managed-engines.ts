/**
 * Managed engines (`tensorrt-llm`, `vllm`, `sglang`) over the core's `/environments` routes, for every
 * client of the workspace at once (design D2): which environment, which target and which descriptor an
 * operation names is decided here, so a command, the terminal UI and the admin never assemble a
 * `begin` themselves. Nothing here depends on which managed engine it is: the core's answers carry
 * the difference.
 */

import { ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type {
  EngineVersionsResponse,
  EnvironmentOperation,
  EnvironmentSnapshot,
  ManagedOperationTarget,
  RequirementPlan,
  RuntimeDescriptorSummary,
} from '@atomic-chat/core/contracts'
import type { ManagedEngineState, WorkspaceInput } from '../../contract/index.js'
import { MANAGED_FINISHED_PHASES } from '../../contract/index.js'
import type { CoreLink } from '../../core-link/index.js'
import { AtcError } from '../../errors/index.js'
import { NOT_CORE } from '../not-core.js'
import { segment } from '../validation.js'

/** The installation `atc` sets up for an engine: the core's convention, one per engine, named after it. */
export function runtimeTarget(engine: string): Extract<ManagedOperationTarget, { kind: 'runtime' }> {
  return { kind: 'runtime', installation_id: engine, engine_id: engine }
}

/** The installed engine's own descriptor, else the engine id: the core resolves that to its newest. */
export function descriptorHint(environment: EnvironmentSnapshot | undefined, engine: string): string {
  return (
    environment?.installations.find((i) => i.engine_id === engine && i.active_descriptor_id)
      ?.active_descriptor_id ?? engine
  )
}

export function isManagedEngine(engine: string): boolean {
  return (ENGINE_KINDS as Readonly<Record<string, string>>)[engine] === 'managed'
}

function managed(input: WorkspaceInput): string {
  const engine = String(input['engine'] ?? '')
  if (!isManagedEngine(engine))
    throw new AtcError('ATC_USAGE', `${engine || 'This'} is not a managed engine.`, {
      hint: 'Managed engines: tensorrt-llm, vllm, sglang.',
    })
  return engine
}

const finished = (operation: EnvironmentOperation) =>
  (MANAGED_FINISHED_PHASES as readonly string[]).includes(operation.phase)
const engineOf = (operation: EnvironmentOperation) =>
  operation.target.kind === 'runtime' ? operation.target.engine_id : null

async function environmentOf(link: CoreLink): Promise<EnvironmentSnapshot | undefined> {
  return ((await link.environments.list()) as EnvironmentSnapshot[])[0]
}

/** The environment, its operations and their engines, as the core's snapshot has them now. */
async function held(link: CoreLink) {
  const snapshot = await link.snapshot()
  const environment = snapshot.environments?.[0] ?? (await environmentOf(link))
  const operations = snapshot.environment_operations ?? []
  return { environment, operations }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Everything a client shows about one managed engine; reads only. */
/** `descriptorId`: the release to plan for — an update's target; by default the installed one, else the engine's. */
export async function managedEngineState(
  link: CoreLink,
  engine: string,
  descriptorId?: string
): Promise<ManagedEngineState> {
  const { environment, operations } = await held(link)
  let plan: RequirementPlan | null = null
  let planError: string | null = null
  try {
    plan = (await link.environments.probe({
      descriptor_id: descriptorId ?? descriptorHint(environment, engine),
      target: runtimeTarget(engine),
    })) as RequirementPlan
  } catch (error) {
    planError = message(error)
  }
  const notices = plan?.descriptor_id
    ? await link
        .request<RuntimeDescriptorSummary>('GET', `/environments/descriptors/${segment(plan.descriptor_id)}`)
        .then((summary) => summary.notices ?? [])
        .catch(() => [])
    : []
  const update = await link
    .request<EngineVersionsResponse>('POST', '/engines/versions', {})
    .then((r) => r.engines?.find((e) => e.engine === engine)?.update ?? null)
    .catch(() => null)
  const running = operations.filter((o) => !finished(o))
  const installations = environment?.installations ?? []
  return {
    engine,
    environment_id: environment?.environment_id ?? plan?.environment_id ?? null,
    executor: environment?.executor ?? null,
    plan,
    plan_error: planError,
    notices,
    installation: installations.find((i) => i.engine_id === engine) ?? null,
    operation: running.find((o) => engineOf(o) === engine) ?? null,
    other_operation: running.find((o) => engineOf(o) !== null && engineOf(o) !== engine) ?? null,
    failed:
      operations.filter((o) => engineOf(o) === engine && o.kind === 'setup' && o.phase === 'failed').at(-1) ??
      null,
    models_kept_for: installations
      .filter((i) => i.engine_id !== engine && i.status === 'ready')
      .map((i) => i.engine_id),
    update,
  }
}

/** The environment an operation goes to: the core's one, or the one its plan names before it exists. */
async function environmentIdFor(link: CoreLink, engine: string, environment?: EnvironmentSnapshot) {
  if (environment) return environment.environment_id
  const plan = (await link.environments.probe({
    descriptor_id: engine,
    target: runtimeTarget(engine),
  })) as RequirementPlan
  return plan.environment_id
}

/** Dispatch one `engines.*` managed operation, or `NOT_CORE` for any other name. */
export async function managedEngineOperation(
  link: CoreLink,
  name: string,
  input: WorkspaceInput
): Promise<unknown> {
  const operationId = () => String(input['operation_id'] ?? '')
  switch (name) {
    case 'engines.plan':
      return managedEngineState(link, managed(input))
    case 'engines.operate': {
      const engine = managed(input)
      const kind = String(input['kind'])
      if (kind !== 'setup' && kind !== 'remove')
        throw new AtcError('ATC_USAGE', 'Choose setup or remove for kind.')
      const environment = await environmentOf(link)
      const others = (environment?.installations ?? []).some(
        (i) => i.engine_id !== engine && i.status === 'ready'
      )
      // The store's models go only with the last managed engine (spec "Удаление managed-движка").
      const body = {
        request_id: String(input['request_id']),
        kind,
        target: runtimeTarget(engine),
        ...(kind === 'setup'
          ? { descriptor_id: descriptorHint(environment, engine) }
          : { retain_models: input['retain_models'] === true || others }),
        ...(input['approved_plan_digest'] ? { approved_plan_digest: input['approved_plan_digest'] } : {}),
      }
      return link.environments.begin(await environmentIdFor(link, engine, environment), body)
    }
    case 'engines.operation':
      return link.environments.get(operationId())
    case 'engines.resume': {
      const current = (await link.environments.get(operationId())) as EnvironmentOperation
      return link.environments.resume(operationId(), {
        expected_revision: current.revision,
        ...(input['approved_plan_digest'] ? { approved_plan_digest: input['approved_plan_digest'] } : {}),
      })
    }
    case 'engines.cancel':
      return link.environments.cancel(operationId())
    case 'engines.diagnostics': {
      const engine = managed(input)
      const id = await environmentIdFor(link, engine, await environmentOf(link))
      return link.request('GET', `/environments/${segment(id)}/diagnostics`)
    }
  }
  return NOT_CORE
}
