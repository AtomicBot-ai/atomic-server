import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from './SetupWizard'

const variants = (engine: string) =>
  engine === 'litert-lm'
    ? {
        model_id: 'gemma-4-e4b',
        name: 'Gemma 4 E4B',
        default_variant: 'gemma-4-e4b-cpu',
        variants: [
          {
            id: 'gemma-4-e4b-cpu',
            backend: 'cpu',
            file: { path: 'gemma.litertlm', size: 1000, sha256: 'x' },
            verdict: { verdict: 'ok', reason: null },
          },
        ],
      }
    : {
        model_id: 'phi',
        name: 'Phi',
        default_variant: 'phi-cpu',
        variants: [
          {
            id: 'phi-cpu',
            device: 'cpu',
            execution_provider: 'cpu',
            size_bytes: 1000,
            verdict: { verdict: 'ok', reason: null, accelerator: null },
          },
        ],
      }

it.each([
  { engine: 'litert-lm', name: 'Gemma 4 E4B', ops: 'litert', variant: 'gemma-4-e4b-cpu' },
  { engine: 'foundry-local', name: 'Phi', ops: 'foundry', variant: 'phi-cpu' },
])(
  'lists $engine’s own models in the first-model step and selects the installed variant',
  async ({ engine, name, ops, variant }) => {
    const { workspace, execute } = workspaceFixture(
      {
        'engines.selected': { engine },
        'models.installed': [],
        'models.catalog': [{ id: 'repo/gguf', name: 'A GGUF model' }],
        'models.search': () => ({ models: [variants(engine)] }),
        [`${ops}.plan`]: { digest: 'plan', blockers: [], variant_id: variant },
      },
      { setup: null }
    )
    render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} onWelcome={vi.fn()} />)
    expect(await screen.findByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.queryByRole('button', { name: 'A GGUF model' })).not.toBeInTheDocument()
    expect(execute).toHaveBeenCalledWith('models.search', { engine, query: '' })
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Download', exact: true }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(`${ops}.install`, {
        request_id: expect.stringMatching(/^admin-/),
        plan_digest: 'plan',
      })
    )
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('config.update', { values: { 'tui.model': variant } })
    )
  }
)
