import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { CloudProviders } from './CloudProviders'
import { SetupWizard } from '../setup/SetupWizard'
import { DeleteConfirmation } from './DeleteConfirmation'

it('Escape returns the inline provider step to permissions without an intermediate provider list', async () => {
  const close = vi.fn()
  const { workspace } = workspaceFixture(
    { 'cloud.list': { providers: [] } },
    { setups: [{ id: 'job', stage: 'downloading' }] as never }
  )
  render(<SetupWizard workspace={workspace} onClose={close} onOpenGoal={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  const provider = screen.getByRole('button', { name: 'OpenAI', exact: true })
  await userEvent.click(provider)
  const dialog = screen.getByRole('region', { name: 'Connect OpenAI' })
  await userEvent.type(within(dialog).getByLabelText('API key', { exact: false }), 'private-value')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: 'Connect OpenAI' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Permissions' })).toBeInTheDocument()
  expect(close).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  expect(screen.getByLabelText('API key', { exact: false })).toHaveValue('')
})
it('Escape closes the library provider form and returns focus to its card', async () => {
  const { workspace } = workspaceFixture({ 'cloud.list': { providers: [] } })
  render(<CloudProviders workspace={workspace} />)
  const provider = screen.getByRole('button', { name: 'OpenAI', exact: true })
  await userEvent.click(provider)
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(provider).toHaveFocus()
})
it('Escape on Custom Endpoint shows its page with an Add endpoint action', async () => {
  const { workspace } = workspaceFixture({ 'cloud.list': { providers: [] } })
  render(<CloudProviders workspace={workspace} custom />)
  await screen.findByRole('dialog')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Add endpoint' })).toBeInTheDocument()
})
it('keeps Skip setup directly before Skip in the same footer action group', async () => {
  const { workspace } = workspaceFixture({}, { setups: [{ id: 'job', stage: 'downloading' }] as never })
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} />)
  await act(async () => {})
  const skip = screen.getByRole('button', { name: 'Skip setup' })
  const group = skip.closest('.first-run-actions')!
  expect(
    within(group as HTMLElement)
      .getAllByRole('button')
      .map((button) => button.textContent)
  ).toEqual(['Skip setup', 'Skip'])
  expect(skip.closest('.first-run-skip')).not.toBeNull()
  expect(screen.getByRole('button', { name: 'Back', exact: true })).toBeInTheDocument()
})
it('keeps onboarding provider selection inline and allows switching without an intermediate dialog', async () => {
  const { workspace } = workspaceFixture({ 'cloud.list': { providers: [] } })
  render(<CloudProviders workspace={workspace} onboarding />)
  await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Connect OpenAI' })).toBeInTheDocument()
  expect(screen.getByLabelText('API key', { exact: false })).toHaveFocus()
  await userEvent.type(screen.getByLabelText('API key', { exact: false }), 'previous-key')
  await userEvent.click(screen.getByRole('button', { name: 'Anthropic', exact: true }))
  expect(screen.getByRole('region', { name: 'Connect Anthropic' })).toBeInTheDocument()
  expect(screen.getByLabelText('API key', { exact: false })).toHaveValue('')
  expect(screen.getByLabelText('API key', { exact: false })).toHaveFocus()
})

it('lets a download confirmation handle Escape before the inline provider editor', async () => {
  const { workspace } = workspaceFixture({ 'cloud.list': { providers: [] } })
  const closed = vi.fn()
  function Example() {
    const [removing, setRemoving] = useState(false)
    return (
      <>
        <CloudProviders workspace={workspace} onboarding />
        <button onClick={() => setRemoving(true)}>Remove Qwen</button>
        {removing && (
          <DeleteConfirmation
            title="Remove download?"
            name="Qwen"
            detail="The download will stop."
            confirm="Remove download"
            onClose={() => {
              closed()
              setRemoving(false)
            }}
            onConfirm={vi.fn()}
          />
        )}
      </>
    )
  }
  render(<Example />)
  await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  await userEvent.type(screen.getByLabelText('API key', { exact: false }), 'draft-key')
  await userEvent.click(screen.getByRole('button', { name: 'Remove Qwen' }))
  await userEvent.keyboard('{Escape}')
  expect(closed).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Connect OpenAI' })).toBeInTheDocument()
  expect(screen.getByLabelText('API key', { exact: false })).toHaveValue('draft-key')
})

it('does not close a new provider editor when an earlier disconnect finishes after Escape', async () => {
  let finish!: () => void
  let providers = [{ provider: 'openai', base_url: 'https://api.openai.com/v1', models: [], connected: true }]
  const { workspace } = workspaceFixture({
    'cloud.list': () => ({ providers }),
    'cloud.remove': () =>
      new Promise((resolve) => {
        finish = () => {
          providers = []
          resolve({})
        }
      }),
  })
  render(<CloudProviders workspace={workspace} />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'OpenAI', exact: true })).toHaveClass('connected')
  )
  await userEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: 'OpenRouter', exact: true }))
  await userEvent.type(screen.getByLabelText('API key', { exact: false }), 'new-provider-key')
  await act(async () => finish())
  expect(screen.getByRole('dialog', { name: 'Connect OpenRouter' })).toBeInTheDocument()
  expect(screen.getByLabelText('API key', { exact: false })).toHaveValue('new-provider-key')
})
