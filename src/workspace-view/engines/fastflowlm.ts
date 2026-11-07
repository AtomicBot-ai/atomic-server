import type {
  FastFlowLmDriverSetup,
  FastFlowLmOperation,
  FastFlowLmProbePlan,
} from '@atomic-chat/core/contracts'

export interface FlmPreparationView {
  probe: FastFlowLmProbePlan
  operation: FastFlowLmOperation | null
  instructions: string[]
}
/** Both clients display and approve the same durable core operation, including its real runtime account. */
export function flmPreparationModel(view: FlmPreparationView) {
  const op = view.operation,
    plan = op?.plan ?? view.probe
  const state = op?.state ?? view.probe.status
  const lines = [
    `NPU: ${state}${op?.reason ? ' — ' + op.reason : ''}`,
    `Server account: ${plan.runtime_account ?? 'unknown'} (${plan.runtime_mode ?? 'unknown'})`,
    ...(plan.runtime_service ? [`Service: ${plan.runtime_service}`] : []),
    ...plan.changes.map((v) => v.text),
    ...plan.packages.map((v) => `${v.name} ${v.version} — ${v.source} — SHA-256 ${v.sha256}`),
    ...plan.blockers,
    ...view.instructions,
  ]
  if (state === 'reboot-required') lines.push('Restart the host, then resume this operation.')
  if (state === 'relogin-required')
    lines.push('Restart the server in its account after relogin or service changes, then resume.')
  const actions: { id: string; label: string }[] = []
  if (state === 'preparing-host' && view.instructions.length)
    actions.push({ id: 'resume', label: 'Authorize preparation' })
  if (state === 'awaiting-consent') actions.push({ id: 'consent', label: 'Agree to these changes' })
  if (['failed', 'cancelled', 'reboot-required', 'relogin-required'].includes(state))
    actions.push({ id: 'resume', label: 'Recheck and resume' })
  if (['awaiting-consent', 'preparing-host', 'checking', 'verifying'].includes(state))
    actions.push({ id: 'stop', label: 'Cancel preparation' })
  if (!op && state === 'action-required') actions.push({ id: 'prepare', label: 'Review preparation' })
  const driverSetup = view.probe.driver_setup
  if (!op && state === 'blocked' && driverSetup) actions.push({ id: 'refresh', label: 'Check again' })
  return { lines, actions, state, digest: plan.plan_digest, driverSetup }
}

/** Core journals are ordered by random UUID, not time; prefer the one operation still needing attention. */
export function currentFlmOperation(operations: FastFlowLmOperation[], probe: FastFlowLmProbePlan) {
  return (
    operations.find((op) => !['ready', 'failed', 'cancelled'].includes(op.state)) ??
    operations.find((op) => op.state === 'failed' && op.plan.plan_digest === probe.plan_digest) ??
    null
  )
}

/** Plain terminal rendering of the same server-owned guidance the admin renders as links and code. */
export function flmDriverSetupLines(setup: FastFlowLmDriverSetup | undefined): string[] {
  return setup
    ? [setup.title, ...setup.steps, ...setup.commands, ...setup.links.map((l) => `${l.label}: ${l.url}`)]
    : []
}
