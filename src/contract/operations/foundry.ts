import type { WorkspaceOperation } from '../workspace.js'
import { operation } from './define.js'

/** Engines & Models: Foundry Local's accelerators, models and variants. */
export const FOUNDRY_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'foundry.accelerators',
    'Foundry Local accelerators',
    'read',
    "List the accelerators Foundry Local's library finds on this machine (name, execution provider, device, prepared, why not), and whether this server is preparing them now with the last prepare's summary. force probes the library again.",
    { properties: { force: { type: 'boolean' } } }
  ),
  operation(
    'foundry.prepare',
    'Prepare Foundry Local accelerators',
    'download',
    "Download and register Foundry Local accelerators in the server (NPU plugins, CUDA, WebGPU; up to about 2 GB): the named ones, or every one not prepared. Progress is the core's foundry-local:accelerators events; a prepare another client runs is waited for.",
    { properties: { accelerators: { type: 'array', items: { type: 'string' } } } }
  ),
  operation(
    'foundry.plan',
    'Review Foundry Local download',
    'read',
    "Plan downloading a Foundry Local variant: model is a model id or a variant id; variant names one, device (npu, gpu, cpu) picks one, else NPU, GPU, CPU among those that run or will once prepared. Answers the variant, the core's verdict, its files (conf's list with sha256, or Azure Blob's listing by size), the room, and blockers. Its digest is what foundry.install accepts.",
    {
      properties: {
        model: { type: 'string' },
        variant: { type: 'string' },
        device: { type: 'string', enum: ['npu', 'gpu', 'cpu'] },
      },
      required: ['model'],
    }
  ),
  operation(
    'foundry.install',
    'Download Foundry Local model',
    'download',
    // core-boundary: model.yml — a description: atc downloads the variant and writes it with the core's serializer (ADR 2026-10-20-foundry-local-models-in-atc)
    'Start or continue (same request_id) the durable download of a reviewed foundry.plan into the data folder: an expired link is resolved again (up to three times) and the download continues; the chat template is repaired for tools; model.yml with the foundry_local block is written last.',
    {
      properties: { request_id: { type: 'string' }, plan_digest: { type: 'string' } },
      required: ['request_id', 'plan_digest'],
    }
  ),
  operation(
    'foundry.cancel',
    'Cancel Foundry Local download',
    'interrupt',
    'Stop a Foundry Local download; its partial files stay for the next foundry.install with the same request_id.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
]
