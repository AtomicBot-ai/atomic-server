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
]
