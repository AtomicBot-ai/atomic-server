import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { CloudProviders } from './CloudProviders'

it.each([
  'The provider rejected this API key. Check the key and try again.',
  'Could not reach the provider. Check its base URL and try again.',
  'This endpoint did not return an OpenAI-compatible model list.',
  'Model not available from this provider: requested-model.',
])('keeps a failed connection editable and retries successfully: %s', async (message) => {
  let fail = true
  let providers: object[] = []
  const { workspace, execute } = workspaceFixture({
    'cloud.list': () => ({ providers }),
    'cloud.connect': (input: Record<string, unknown>) => {
      if (fail) throw new Error(message)
      const result = {
        provider: input.provider,
        base_url: input.base_url,
        models: ['requested-model'],
        connected: true,
      }
      providers = [result]
      return result
    },
  })
  render(<CloudProviders workspace={workspace} />)
  await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  await userEvent.type(screen.getByLabelText('API key', { exact: false }), 'fixture-key')
  await userEvent.type(screen.getByLabelText('Model IDs', { exact: false }), 'requested-model')
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByLabelText('API key', { exact: false })).toHaveValue('fixture-key')
  expect(screen.getByLabelText('Model IDs', { exact: false })).toHaveValue('requested-model')
  expect(screen.getByLabelText('Base URL', { exact: false })).toHaveValue('https://api.openai.com/v1')
  expect(screen.queryByText('✓ Connected')).not.toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(await screen.findByText('✓ Connected')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(execute.mock.calls.filter(([name]) => name === 'cloud.connect')).toHaveLength(2)
})
it('explains the gateway restriction before connecting a native provider', async () => {
  const { workspace, execute } = workspaceFixture({ 'cloud.list': { providers: [] } })
  render(<CloudProviders workspace={workspace} />)
  await userEvent.click(screen.getByRole('button', { name: 'Anthropic', exact: true }))
  expect(screen.getByText(/native Anthropic API is not supported here/)).toHaveTextContent(
    'OpenAI-compatible gateway'
  )
  expect(screen.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled()
  expect(execute.mock.calls.some(([name]) => name === 'cloud.connect')).toBe(false)
})
it('requires a provider and valid endpoint without embedded credentials before submitting', async () => {
  const { workspace, execute } = workspaceFixture({ 'cloud.list': { providers: [] } })
  render(<CloudProviders workspace={workspace} custom />)
  const connect = await screen.findByRole('button', { name: 'Connect', exact: true })
  expect(connect).toBeDisabled()
  await userEvent.type(screen.getByLabelText('Provider name', { exact: false }), 'fixture')
  for (const value of [
    'not-a-url',
    'ftp://provider.example',
    'https://user:secret@provider.example/v1',
    'https://provider.example/v1?token=value',
  ]) {
    await userEvent.clear(screen.getByLabelText('Base URL', { exact: false }))
    await userEvent.type(screen.getByLabelText('Base URL', { exact: false }), value)
    expect(connect).toBeDisabled()
    expect(screen.getByLabelText('Base URL', { exact: false })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/Use HTTP or HTTPS without URL credentials/)).toBeInTheDocument()
  }
  expect(execute.mock.calls.some(([name]) => name === 'cloud.connect')).toBe(false)
})
it('shows a provider-list failure and lets the user retry it', async () => {
  let fail = true
  const { workspace } = workspaceFixture({
    'cloud.list': () => {
      if (fail) throw new Error('Server connection lost. Retry when it is available.')
      return { providers: [] }
    },
  })
  render(<CloudProviders workspace={workspace} />)
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server connection lost'))
  expect(screen.queryByText('✓ Connected')).not.toBeInTheDocument()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})
