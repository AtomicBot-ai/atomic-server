import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { ServerModel } from './ServerModel'

it('offers registered local engines when the current cloud provider is not in the picker', async () => {
  const { workspace } = workspaceFixture(
    {
      'engines.list': enginesList(['llamacpp-upstream', 'mlx']),
      'models.installed': [],
    },
    {
      services: [
        {
          id: 'chat',
          kind: 'chat',
          provider: 'openrouter',
          model: 'cloud-model',
          state: 'ready',
          details: {},
        },
      ],
    }
  )
  render(<ServerModel workspace={workspace} openModels={vi.fn()} />)
  expect(await screen.findByText('Select engine')).toBeInTheDocument()
  expect(screen.queryByText('No engines available')).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Inference engine'))
  await userEvent.click(screen.getByRole('option', { name: /MLX/ }))
  expect(screen.getByLabelText('Inference engine')).toHaveValue('mlx')
})

it('reserves the empty-engine message for a genuinely empty list', async () => {
  const { workspace } = workspaceFixture({ 'engines.list': enginesList([]), 'models.installed': [] })
  render(<ServerModel workspace={workspace} openModels={vi.fn()} />)
  expect(await screen.findByText('No engines available')).toBeInTheDocument()
})
