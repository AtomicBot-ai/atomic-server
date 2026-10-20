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
]
