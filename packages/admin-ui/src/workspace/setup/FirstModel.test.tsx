import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { FirstModel } from './FirstModel'

it('uses FLM recommendation metadata instead of a three-card limit', async () => {
  const { workspace } = workspaceFixture({
    'engines.selected': { engine: 'fastflowlm' },
    'models.installed': [],
    'models.search': {
      models: Array.from({ length: 5 }, (_, i) => ({
        model_id: String(i),
        name: `Model ${i}`,
        recommended: i < 4,
        variants: [],
      })),
    },
  })
  render(<FirstModel workspace={workspace} select={vi.fn()} />)
  const heading = await screen.findByRole('heading', { name: 'Recommended' })
  expect(within(heading.nextElementSibling as HTMLElement).getAllByRole('button')).toHaveLength(4)
  expect(screen.getByRole('heading', { name: 'More models' })).toBeInTheDocument()
})

it.each(['fastflowlm', 'mlx', 'atomic-prism'])('keeps downloaded models scoped to %s', async (engine) => {
  const { workspace } = workspaceFixture({
    'engines.selected': { engine },
    'models.installed': [
      { id: 'foreign', name: 'Foreign model', provider: 'llamacpp-upstream' },
      { id: 'mine', name: 'My model', provider: engine },
      { id: 'unusable', name: 'Unusable model', provider: engine, providers: [] },
      { id: 'excluded', name: 'Excluded model', provider: engine, providers: ['another-engine'] },
    ],
    'models.search': { models: [] },
    'models.catalog': [],
  })
  render(<FirstModel workspace={workspace} select={vi.fn()} />)
  await screen.findByRole('button', { name: /My model/ })
  expect(screen.queryByRole('button', { name: /Foreign model/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Unusable model|Excluded model/ })).not.toBeInTheDocument()
})

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

it('does not recommend a catalog model again when its download is installed under its file name', async () => {
  const { workspace } = workspaceFixture({
    'engines.selected': { engine: 'llamacpp-upstream' },
    'models.installed': [
      {
        id: 'LiquidAI/LFM2-1.2B-Q4_K_M',
        name: 'LFM2-1.2B-Q4_K_M',
        provider: 'llamacpp-upstream',
        repository: 'LiquidAI/LFM2-1.2B-GGUF',
      },
    ],
    'models.catalog': {
      rows: [
        { id: 'LiquidAI/LFM2-1.2B-GGUF', name: 'LFM2 1.2B', category: 'text', source: { format: 'gguf' } },
        { id: 'AtomicChat/Other-GGUF', name: 'Other', category: 'text', source: { format: 'gguf' } },
      ],
    },
  })
  render(<FirstModel workspace={workspace} select={vi.fn()} />)
  expect(await screen.findByRole('button', { name: /^Other/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /LFM2-1.2B-Q4_K_M/ })).toHaveTextContent('Downloaded')
  expect(screen.queryByRole('button', { name: /^LFM2 1\.2B/ })).not.toBeInTheDocument()
})

it.each(['fastflowlm', 'geniex', 'litert-lm', 'foundry-local'])(
  'keeps the downloaded %s variant selected when returning from a later step',
  async (engine) => {
    const { workspace } = workspaceFixture({
      'engines.selected': { engine },
      'models.installed': [
        { id: 'older', name: 'Older model', provider: engine },
        { id: 'chosen-native', name: 'Chosen downloaded model', provider: engine },
      ],
      'models.search': {
        models: [
          {
            model_id: 'chosen-family',
            name: 'Chosen family',
            default_variant: 'chosen-native',
            variants: [{ id: 'chosen-native', record: { variant_id: 'chosen-native' } }],
          },
        ],
      },
    })
    const select = vi.fn()
    render(<FirstModel workspace={workspace} select={select} initialChoice="catalog:chosen-family" />)
    expect(await screen.findByRole('button', { name: /Chosen downloaded model/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'chosen-native' }), true)
  }
)
