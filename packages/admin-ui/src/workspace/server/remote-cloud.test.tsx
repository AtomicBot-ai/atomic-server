import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { RemoteAccess } from './RemoteAccess'
import { CloudProviders } from '../library/CloudProviders'
it('keeps public tunnel and local listener actions separate and copies usable LAN addresses', async () => {
  const { workspace, execute } = workspaceFixture({
    'remote.status': { state: 'off', canStart: true, canStop: false },
    'remote.addresses': { addresses: ['192.168.1.10'] },
  })
  render(<RemoteAccess workspace={workspace} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start remote access' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Start remote access' }))
  expect(execute).toHaveBeenCalledWith('remote.start', { request: {} })
  expect(execute).not.toHaveBeenCalledWith('api.restart', expect.anything())
  await userEvent.click(screen.getByRole('button', { name: 'Start local network' }))
  expect(execute).toHaveBeenCalledWith('api.restart', { request: { host: '0.0.0.0' } })
})
it('stores cloud credentials only on explicit Connect and removes the password from the form afterwards', async () => {
  const { workspace, execute } = workspaceFixture({ 'cloud.list': { providers: [] } })
  render(<CloudProviders workspace={workspace} />)
  await userEvent.click(screen.getByRole('button', { name: 'Custom provider' }))
  await userEvent.type(screen.getByLabelText('Provider name'), 'test')
  await userEvent.type(screen.getByLabelText('Base URL', { exact: false }), 'https://provider.example/v1')
  await userEvent.type(screen.getByLabelText('Model IDs', { exact: false }), 'one, two')
  const key = screen.getByLabelText('API key', { exact: false })
  expect(key).toHaveAttribute('type', 'password')
  await userEvent.type(key, 'fixture-secret')
  expect(execute).not.toHaveBeenCalledWith('cloud.connect', expect.anything())
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(execute).toHaveBeenCalledWith('cloud.connect', {
    provider: 'test',
    base_url: 'https://provider.example/v1',
    api_key: 'fixture-secret',
    models: ['one', 'two'],
  })
  await waitFor(() => expect(screen.queryByDisplayValue('fixture-secret')).not.toBeInTheDocument())
})
