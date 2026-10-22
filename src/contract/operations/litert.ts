import type { WorkspaceOperation } from '../workspace.js'
import { operation } from './define.js'

/** Engines & Models: LiteRT-LM's accelerator. */
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
]
