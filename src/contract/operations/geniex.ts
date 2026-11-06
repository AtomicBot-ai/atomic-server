import { operation } from './define.js'
export const GENIEX_OPERATIONS = [
  operation(
    'geniex.accelerators',
    'GenieX devices',
    'read',
    'Show the Snapdragon chip and devices reported by GenieX.',
    { properties: {} }
  ),
  operation(
    'geniex.plan',
    'Review GenieX download',
    'read',
    'Choose a GGUF device or the AI Hub bundle for this chip, check compatibility and disk space.',
    { properties: { model: { type: 'string' }, variant: { type: 'string' } }, required: ['model'] }
  ),
  operation(
    'geniex.install',
    'Download GenieX model',
    'download',
    'Start or resume a verified GenieX download from a reviewed plan.',
    {
      properties: { request_id: { type: 'string' }, plan_digest: { type: 'string' } },
      required: ['request_id', 'plan_digest'],
    }
  ),
  operation(
    'geniex.cancel',
    'Pause GenieX download',
    'interrupt',
    'Stop the download and keep its partial files.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
]
