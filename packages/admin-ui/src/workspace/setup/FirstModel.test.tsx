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

it('does not offer a LiteRT-LM family again when one of its variants is installed', async () => {
  const variant = (id: string) => ({ id, backend: 'cpu', file: { size: 1 }, verdict: { verdict: 'ok' } })
  const { workspace } = workspaceFixture({
    'engines.selected': { engine: 'litert-lm' },
    'models.installed': [{ id: 'gemma-4-e4b-cpu', name: 'Gemma 4 E4B (CPU)', provider: 'litert-lm' }],
    'models.search': {
      models: [
        { model_id: 'gemma-4-e4b', name: 'Gemma 4 E4B', variants: [variant('gemma-4-e4b-cpu')] },
        { model_id: 'qwen3-4b', name: 'Qwen3 4B', variants: [variant('qwen3-4b-cpu')] },
      ],
    },
  })
  render(<FirstModel workspace={workspace} select={vi.fn()} />)
  expect(await screen.findByRole('button', { name: /^Qwen3 4B/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Gemma 4 E4B\b(?! \(CPU\))/ })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Gemma 4 E4B \(CPU\)/ })).toHaveTextContent('Downloaded')
})
