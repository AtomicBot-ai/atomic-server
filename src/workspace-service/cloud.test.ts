import { expect, it } from 'vitest'
import { coreOperation } from './core-operations.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { WORKSPACE_OPERATIONS } from '../contract/index.js'
import { inputFor } from './validation.js'
it('routes cloud registration to the core credential boundary with an escaped provider ID', async () => {
  const link = fakeCoreLink()
  const config = {
    provider: 'team/provider',
    base_url: 'https://provider.example/v1',
    api_key: 'fixture-secret',
    models: ['model-a'],
  }
  await coreOperation(link, 'cloud.save', config)
  expect(link.calls.at(-1)).toEqual({
    method: 'PUT',
    path: '/cloud/providers/team%2Fprovider',
    body: { base_url: config.base_url, api_key: config.api_key, models: config.models },
  })
  await coreOperation(link, 'cloud.list', {})
  expect(link.calls.at(-1)?.path).toBe('/cloud/providers')
  await coreOperation(link, 'cloud.remove', { provider: 'team/provider' })
  expect(link.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/cloud/providers/team%2Fprovider' })
})
it('marks credential registration as secret and validates model IDs before forwarding', () => {
  const op = WORKSPACE_OPERATIONS.find((o) => o.name === 'cloud.save')!
  expect(op.effect).toBe('secret')
  expect(() => inputFor(op, { provider: 'p', base_url: 'https://provider.example', models: [3] })).toThrow()
  expect(() =>
    inputFor(op, { provider: 'p', base_url: 'https://provider.example', models: ['m'] })
  ).not.toThrow()
})
