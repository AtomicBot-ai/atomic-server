import type { WorkspaceOperation } from '../workspace.js'
import { operation, request } from './define.js'

/** Engines & Models: engine builds, provider settings, hardware and managed environments. */
export const ENGINE_OPERATIONS: readonly WorkspaceOperation[] = [
  operation('engines.selected', 'Selected engine', 'read', 'Read the engine selected for this workspace.'),
  operation(
    'engines.select',
    'Select engine',
    'configure',
    'Use an installed inference engine for onboarding and server setup in every frontend.',
    {
      properties: { engine: { type: 'string' } },
      required: ['engine'],
    }
  ),
  operation(
    'engines.list',
    'Engines and builds',
    'read',
    'List installed and available inference engines and their versions; force checks upstream again.',
    { properties: { force: { type: 'boolean' } } }
  ),
  operation(
    'engines.catalog',
    'Engine builds',
    'read',
    'List the builds of one engine that this machine can run.',
    { properties: { engine: { type: 'string' }, force: { type: 'boolean' } }, required: ['engine'] }
  ),
  operation(
    'engines.install',
    'Install engine',
    'download',
    'Install an engine; Core selects the build for this platform. Managed engines may require host steps. Engine capability limits apply.',
    {
      properties: {
        engine: { type: 'string' },
        request: request({
          task_id: {},
          request_id: {},
          approved_update: { type: 'string' },
          target: { type: 'object' },
          force: { type: 'boolean' },
          proxy: { type: 'object' },
          app_version: {},
        }),
      },
      required: ['engine'],
    }
  ),
  operation(
    'engines.enqueue',
    'Download engine',
    'download',
    'Queue a supported engine build in the background. Selection records intent; readiness still requires the installation to finish.',
    {
      properties: { engine: { type: 'string' }, target: { type: 'object' }, select: { type: 'boolean' } },
      required: ['engine'],
    }
  ),
  operation(
    'engines.retry',
    'Retry engine download',
    'download',
    'Retry a failed or interrupted engine build. The core owns build files and installation.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'engines.activate',
    'Activate engine build',
    'configure',
    'Make an installed engine build (version and variant) the active one.',
    {
      properties: { engine: { type: 'string' }, version: { type: 'string' }, variant: { type: 'string' } },
      required: ['engine', 'version', 'variant'],
    }
  ),
  operation('engines.remove', 'Remove engine build', 'configure', 'Remove an installed engine build.', {
    properties: { engine: { type: 'string' }, version: { type: 'string' }, variant: { type: 'string' } },
    required: ['engine', 'version', 'variant'],
  }),
  operation(
    'engines.plan',
    'Managed engine state',
    'read',
    "Read one managed engine (tensorrt-llm, vllm, sglang): the core's plan for this machine (system changes, download and disk, elevation, sign-in or restart, blockers, warnings), the descriptor's notices, the installation, its operation in progress, another engine's operation it would wait for, the last failed setup and the update offer. Probing changes nothing.",
    { properties: { engine: { type: 'string' } }, required: ['engine'] }
  ),
  operation(
    'engines.operate',
    'Set up or remove managed engine',
    'download',
    'Begin the durable setup or removal of a managed engine. request_id makes a retry join the same operation; approved_plan_digest is the plan_digest of the plan the person agreed to (without it the operation waits in awaiting-consent). A removal keeps the shared models when retain_models is true or another managed engine is installed.',
    {
      properties: {
        engine: { type: 'string' },
        kind: { type: 'string', enum: ['setup', 'remove'] },
        request_id: { type: 'string' },
        approved_plan_digest: { type: 'string' },
        retain_models: { type: 'boolean' },
      },
      required: ['engine', 'kind', 'request_id'],
    }
  ),
  operation(
    'engines.operation',
    'Managed engine operation',
    'read',
    'Read one managed-engine operation: its phase, progress, pending privileged step, plan digests and error.',
    { properties: { operation_id: { type: 'string' } }, required: ['operation_id'] }
  ),
  operation(
    'engines.resume',
    'Continue managed engine operation',
    'configure',
    'Continue a managed-engine operation that waits for consent, a sign-in, a restart, or that failed or was cancelled. In awaiting-consent, approved_plan_digest approves the plan on offer; elsewhere it may only restate the current one.',
    {
      properties: { operation_id: { type: 'string' }, approved_plan_digest: { type: 'string' } },
      required: ['operation_id'],
    }
  ),
  operation(
    'engines.cancel',
    'Cancel managed engine operation',
    'interrupt',
    'Ask the core to cancel a managed-engine operation; work that cannot stop safely is cancelled at its next safe boundary.',
    { properties: { operation_id: { type: 'string' } }, required: ['operation_id'] }
  ),
  operation(
    'engines.diagnostics',
    'Managed engine diagnostics',
    'read',
    "Read the core's read-only report on the managed environment: the snapshot with its blockers and GPUs, where its documents come from, every operation on disk and recent warnings.",
    { properties: { engine: { type: 'string' } }, required: ['engine'] }
  ),
  operation(
    'settings.schema',
    'Engine setting controls',
    'read',
    'Read the settings schema of a provider: fields, types and limits.',
    { properties: { provider: { type: 'string' } }, required: ['provider'] }
  ),
  operation(
    'settings.get',
    'Engine settings',
    'read',
    'Read the current settings of a provider with their revision.',
    { properties: { provider: { type: 'string' } }, required: ['provider'] }
  ),
  // core-boundary: version_backend — the description tells agents to use engines.activate instead
  operation(
    'settings.update',
    'Save engine settings',
    'configure',
    'Change provider settings; expected_revision refuses the change if another one landed first. The engine build (version_backend) is not a setting here: choose it with engines.activate.',
    {
      properties: {
        provider: { type: 'string' },
        values: { type: 'object' },
        expected_revision: { type: 'number' },
      },
      required: ['provider', 'values'],
    }
  ),
  operation('hardware.info', 'Hardware', 'read', 'Read the detected CPU, memory and GPUs.'),
  operation(
    'hardware.refresh',
    'Refresh hardware',
    'configure',
    'Probe the hardware again so Core picks engine builds for what is there now.'
  ),
  operation(
    'hardware.devices',
    'Engine devices',
    'read',
    'List the devices a provider can run on (llama.cpp by default).',
    { properties: { provider: { type: 'string' } } }
  ),
  operation(
    'environments.list',
    'Managed engines',
    'read',
    'List managed runtime environments, the container runtimes that engines such as vLLM and TensorRT-LLM need.'
  ),
  operation(
    'environments.probe',
    'Check managed host',
    'read',
    'Check whether this host can run a managed environment and which host steps that needs.',
    { properties: { request: { type: 'object' } }, required: ['request'] }
  ),
  operation(
    'environments.begin',
    'Prepare managed engine',
    'configure',
    'Start provisioning a managed environment; privileged host steps may wait for approval.',
    { properties: { id: { type: 'string' }, request: { type: 'object' } }, required: ['id', 'request'] }
  ),
  operation(
    'environments.get',
    'Get host operation',
    'read',
    'Read the state of one managed environment and its pending host steps.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'environments.cancel',
    'Cancel host operation',
    'configure',
    'Cancel provisioning a managed environment.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'environments.resume',
    'Resume host operation',
    'configure',
    'Resume provisioning a managed environment after its host steps are done.',
    { properties: { id: { type: 'string' }, request: { type: 'object' } }, required: ['id'] }
  ),
]
