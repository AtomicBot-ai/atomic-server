import type { WorkspaceOperation } from '../workspace.js'
import { operation } from './define.js'

/** Engines & Models: LiteRT-LM's accelerator, models and variants. */
export const LITERT_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'litert.accelerators',
    'LiteRT-LM accelerators',
    'read',
    "List the accelerators the core offers LiteRT-LM on this machine (openvino for an Intel NPU on Windows; none elsewhere) with version, size and prepared, the NPU generation, and whether this server is preparing them now with the last prepare's summary.",
    { properties: {} }
  ),
  operation(
    'litert.prepare',
    'Prepare LiteRT-LM accelerators',
    'download',
    "Download and unpack LiteRT-LM's accelerators in the server (openvino, about 85 MB) through atc's proxy: the named ones, or every one not prepared. Progress is the core's litert-lm:accelerators events; a prepare another client runs is waited for.",
    { properties: { accelerators: { type: 'array', items: { type: 'string' } } } }
  ),
  operation(
    'litert.plan',
    'Review LiteRT-LM download',
    'read',
    "Plan downloading a LiteRT-LM variant: model is conf's model id, a Hugging Face repository or a variant id; variant names one, backend (npu, gpu, cpu) picks one, else NPU, GPU, CPU among those that run or will once prepared. Answers the variant, the core's verdict, its file (size, sha256, pinned commit), the room, and blockers (a verdict other than ok, a gated repository without the server's HF_TOKEN). Its digest is what litert.install accepts.",
    {
      properties: {
        model: { type: 'string' },
        variant: { type: 'string' },
        backend: { type: 'string', enum: ['npu', 'gpu', 'cpu'] },
      },
      required: ['model'],
    }
  ),
  operation(
    'litert.install',
    'Download LiteRT-LM model',
    'download',
    // core-boundary: model.yml — a description: atc downloads the variant and writes it with the core's serializer (ADR 2026-10-22-litert-lm-in-atc)
    "Start or continue (same request_id) the durable download of a reviewed litert.plan into the data folder: resumable, sha256-checked, HF_TOKEN to Hugging Face's hosts only; the core checks the file, then model.yml with the litert_lm block is written last.",
    {
      properties: { request_id: { type: 'string' }, plan_digest: { type: 'string' } },
      required: ['request_id', 'plan_digest'],
    }
  ),
  operation(
    'litert.cancel',
    'Cancel LiteRT-LM download',
    'interrupt',
    'Stop a LiteRT-LM download; its partial file stays for the next litert.install with the same request_id.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
]
