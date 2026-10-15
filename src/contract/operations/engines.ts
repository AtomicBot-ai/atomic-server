import type { WorkspaceOperation } from '../workspace.js'
import { operation, request } from './define.js'

/** Engines & Models: engine builds, provider settings, hardware and managed environments. */
export const ENGINE_OPERATIONS: readonly WorkspaceOperation[] = [
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
  operation(
    'settings.update',
    'Save engine settings',
    'configure',
    'Change provider settings; expected_revision refuses the change if another one landed first.',
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
