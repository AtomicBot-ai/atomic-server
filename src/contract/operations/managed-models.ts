import type { WorkspaceOperation } from '../workspace.js'
import { operation } from './define.js'

/** Engines & Models: Hugging Face checkpoints for the managed engines and their shared store. */
export const MANAGED_MODEL_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'models.check',
    'Check model for managed engines',
    'read',
    "Read a Hugging Face repository at a revision (pinned to its commit, configs, files with sizes and sha256, tensor names from the safetensors headers; no weights) and return each managed engine's verdict from the core: architectures, quantization, weight bytes, the card checked, other cards it fits, warnings, or the reason with numbers. engine limits it to one managed engine.",
    {
      properties: {
        repository: { type: 'string' },
        revision: { type: 'string' },
        engine: { type: 'string' },
      },
      required: ['repository'],
    }
  ),
  operation(
    'managed.plan',
    'Review managed model download',
    'read',
    "Plan downloading a Hugging Face checkpoint into the managed engines' shared store for one engine: its verdict, the store the core names and its free space, the files still missing, whether the revision is already there, and blockers. Its digest is what managed.install accepts.",
    {
      properties: {
        repository: { type: 'string' },
        revision: { type: 'string' },
        engine: { type: 'string' },
      },
      required: ['repository', 'engine'],
    }
  ),
  operation(
    'managed.install',
    'Download managed model',
    'download',
    // core-boundary: model.yml — a description: atc downloads the checkpoint into the core's store and writes it last (ADR 2026-10-20-download-managed-models-in-atc)
    'Start or continue (same request_id) the durable download of a reviewed managed.plan into the shared store: files verified by size and sha256, model.yml written last, then the core asked to list the model. It runs in the server and survives the terminal.',
    {
      properties: { request_id: { type: 'string' }, plan_digest: { type: 'string' } },
      required: ['request_id', 'plan_digest'],
    }
  ),
  operation(
    'managed.cancel',
    'Cancel managed model download',
    'interrupt',
    'Stop a managed model download; its partial files stay for the next managed.install with the same request_id.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'managed.list',
    'Managed model downloads',
    'read',
    'List the managed model downloads of this server.'
  ),
]
