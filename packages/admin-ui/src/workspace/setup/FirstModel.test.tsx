import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { FirstModel } from './FirstModel'

it('shows the chosen model only in its card and continues with the shared engine', async () => {
  const { workspace } = workspaceFixture({
    'engines.selected': { engine: 'llamacpp', id: 'llamacpp|b3|cpu' },
    'models.installed': [],
    'models.catalog': [
      { id: 'first', name: 'First model', source: { format: 'gguf' } },
      { id: 'mlx-only', name: 'MLX model', source: { format: 'mlx' } },
    ],
  })
  const select = vi.fn()
  render(<FirstModel workspace={workspace} select={select} />)
  const card = await screen.findByRole('button', { name: 'First model' })
  expect(card).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByText('First model')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'MLX model' })).not.toBeInTheDocument()
  const actionbar = screen.getByRole('button', { name: 'Continue' }).parentElement!
  expect(within(actionbar).queryByText('First model')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'first', onboarding_engine: 'llamacpp' }),
    false
  )
})
