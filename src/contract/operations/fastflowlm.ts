import { operation } from './define.js'
const string = { type: 'string' as const }
const id = { properties: { id: string }, required: ['id'] }
export const FASTFLOWLM_OPERATIONS = [
  operation(
    'fastflowlm.host-steps',
    'Pending NPU host steps',
    'read',
    'Read exact manual elevation commands for pending NPU steps.'
  ),
  operation(
    'fastflowlm.accelerators',
    'FastFlowLM NPU',
    'read',
    'Show NPU readiness for the real server account and service.'
  ),
  operation(
    'fastflowlm.probe',
    'Review NPU preparation',
    'read',
    'Probe the server and return the exact dependency plan, packages and blockers.'
  ),
  operation(
    'fastflowlm.operations',
    'NPU preparation operations',
    'read',
    'Restore durable NPU preparation operations.'
  ),
  operation(
    'fastflowlm.prepare',
    'Prepare FastFlowLM NPU',
    'configure',
    'Create or join a durable preparation operation; consent is separate.',
    { properties: { request_id: string }, required: ['request_id'] }
  ),
  operation('fastflowlm.status', 'NPU preparation status', 'read', 'Read the current preparation state.', id),
  operation(
    'fastflowlm.consent',
    'Approve NPU preparation',
    'configure',
    'Approve exactly the displayed plan digest and operation revision.',
    {
      properties: { id: string, approved_plan_digest: string, expected_revision: { type: 'integer' } },
      required: ['id', 'approved_plan_digest', 'expected_revision'],
    }
  ),
  operation(
    'fastflowlm.resume',
    'Resume NPU preparation',
    'configure',
    'Recheck readiness after reboot, relogin or service restart.',
    {
      properties: { id: string, expected_revision: { type: 'integer' } },
      required: ['id', 'expected_revision'],
    }
  ),
  operation(
    'fastflowlm.stop',
    'Cancel NPU preparation',
    'interrupt',
    'Cancel at a safe package transaction boundary.',
    id
  ),
  operation(
    'fastflowlm.plan',
    'Review FastFlowLM model',
    'read',
    'Pin the complete model file plan, license, compatibility and disk requirements.',
    { properties: { model: string, variant: string, refresh: { type: 'boolean' } }, required: ['model'] }
  ),
  operation(
    'fastflowlm.install',
    'Install FastFlowLM model',
    'download',
    'Start or resume the pinned server download; replace an old version only after verification.',
    { properties: { request_id: string, plan_digest: string }, required: ['request_id', 'plan_digest'] }
  ),
  operation(
    'fastflowlm.cancel',
    'Pause FastFlowLM download',
    'interrupt',
    'Keep partial files for Resume.',
    id
  ),
]
