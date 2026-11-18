import { operation } from './define.js'

export const STRATA_OPERATIONS = [
  operation(
    'strata.plan',
    'Review Strata installation',
    'read',
    'Review a pinned Strata model variant. Use an absolute server directory to import the complete input set.',
    {
      properties: {
        model: { type: 'string' },
        refresh: { type: 'boolean' },
        import_directory: { type: 'string' },
      },
      required: ['model'],
    }
  ),
  operation(
    'strata.install',
    'Install Strata model',
    'download',
    'Start or resume acquisition and preparation using the same reviewed plan and request ID.',
    {
      properties: { request_id: { type: 'string' }, plan_digest: { type: 'string' } },
      required: ['request_id', 'plan_digest'],
    }
  ),
  operation(
    'strata.cancel',
    'Cancel Strata installation',
    'interrupt',
    'Pause acquisition or stop preparation, keeping verified sources for a retry.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation(
    'strata.status',
    'Strata installation status',
    'read',
    'Read server install jobs and the latest preparation revision from the core.'
  ),
] as const
