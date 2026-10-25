import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { CloudProviders } from './CloudProviders'
it('shows a pending connection until validation finishes and then mutes the connected provider card', async () => {
  let finish!: (result: object) => void
  let providers: object[] = []
  const { workspace, execute } = workspaceFixture({
    'cloud.list': () => ({ providers }),
    'cloud.connect': () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  render(<CloudProviders workspace={workspace} />)
  await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  await userEvent.type(screen.getByLabelText('API key', { exact: false }), 'fixture-secret')
  await userEvent.type(screen.getByLabelText('Model IDs', { exact: false }), 'one')
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(screen.getByRole('button', { name: /Checking connection/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'OpenAI', exact: true })).toBeDisabled()
  expect(screen.queryByText('✓ Connected')).not.toBeInTheDocument()
  const saved = {
    provider: 'openai',
    base_url: 'https://api.openai.com/v1',
    models: ['one'],
    connected: true,
  }
  providers = [saved]
  await act(async () => finish(saved))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'OpenAI', exact: true })).toHaveClass('connected')
  )
  expect(screen.getByText('✓ Connected')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('fixture-secret')).not.toBeInTheDocument()
  expect(execute.mock.calls.filter(([name]) => name === 'cloud.connect')).toHaveLength(1)
})
it('keeps failed settings editable without marking the provider connected', async () => {
  const { workspace } = workspaceFixture({
    'cloud.list': { providers: [] },
    'cloud.connect': () => {
      throw new Error('The provider rejected this API key.')
    },
  })
  render(<CloudProviders workspace={workspace} />)
  await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  expect(screen.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled()
  await userEvent.type(screen.getByLabelText('API key', { exact: false }), 'rejected-fixture-key')
  await userEvent.type(screen.getByLabelText('Model IDs', { exact: false }), 'one')
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('rejected this API key')
  expect(screen.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled()
  expect(screen.queryByText('✓ Connected')).not.toBeInTheDocument()
})
