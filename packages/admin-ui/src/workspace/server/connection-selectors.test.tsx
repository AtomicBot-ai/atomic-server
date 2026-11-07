import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Connections } from './Connections'

it('labels both connection selectors and uses the chosen model in examples and requests', async () => {
  const { workspace, execute } = workspaceFixture(
    {},
    {
      services: ['first-model', 'second-model'].map((model) => ({
        id: model,
        model,
        provider: 'llamacpp-upstream',
        kind: 'chat',
        state: 'loaded',
        details: {},
      })),
      keys: [{ id: 'key', name: 'Client', preview: 'atc_…1234', createdAt: 1 }],
    }
  )
  render(
    <Connections
      workspace={workspace}
      openCommand={vi.fn()}
      openSetup={vi.fn()}
      openKeys={vi.fn()}
      connectAgent={vi.fn()}
    />
  )
  const model = screen.getByRole('combobox', { name: 'Connection model' })
  const language = screen.getByRole('combobox', { name: 'Example language' })
  await userEvent.click(screen.getByText('Connection model', { selector: 'label' }))
  expect(model).toHaveFocus()
  await userEvent.selectOptions(model, 'second-model')
  await userEvent.click(screen.getByText('Example language', { selector: 'label' }))
  expect(language).toHaveFocus()
  await userEvent.selectOptions(language, 'python')
  expect(screen.getByText(/from openai import OpenAI/)).toHaveTextContent('model="second-model"')
  await userEvent.click(screen.getByRole('button', { name: 'Send test request' }))
  expect(execute).toHaveBeenCalledWith('setup.complete', { model_id: 'second-model' })
  expect(await screen.findByRole('status')).toHaveTextContent('Model responded successfully.')
  await userEvent.selectOptions(model, 'first-model')
  expect(screen.queryByText('Model responded successfully.')).not.toBeInTheDocument()
})
