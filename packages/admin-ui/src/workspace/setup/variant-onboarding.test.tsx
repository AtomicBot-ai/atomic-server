import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
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
    render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} />)
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

it('keeps FastFlowLM review in a dialog and rechecks the chosen variant after engine setup', async () => {
  const modelId = 'gemma4e-flash'
  const variant = `${modelId}-e4b-npu2`
  let verdict = { verdict: 'engine-not-installed', reason: 'Install a verified FastFlowLM build.' }
  const { workspace, execute } = workspaceFixture(
    {
      'engines.list': enginesList(['fastflowlm']),
      'engines.selected': { engine: 'fastflowlm' },
      'models.installed': [],
      'models.search': () => ({
        models: [
          {
            model_id: modelId,
            name: 'Gemma 4E Flash',
            default_variant: `${modelId}-e2b-npu2`,
            variants: [
              { id: `${modelId}-e2b-npu2`, verdict },
              { id: variant, size_bytes: 8192, verdict },
            ],
          },
        ],
      }),
      'fastflowlm.probe': { status: 'ready', blockers: [], changes: [], packages: [] },
      'fastflowlm.operations': [],
      'fastflowlm.host-steps': [],
      'fastflowlm.plan': { digest: 'flm-plan', blockers: [], variant_id: variant },
    },
    { setup: null }
  )
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  await screen.findByRole('button', { name: 'FastFlowLM · Build installed' })
  await userEvent.keyboard('{Escape}')
  const card = await screen.findByRole('button', { name: /Gemma 4E Flash/ })
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('dialog', { name: 'Install Gemma 4E Flash' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Install Gemma 4E Flash' })).not.toBeInTheDocument()
  expect(card).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  const reopened = within(screen.getByRole('dialog', { name: 'Install Gemma 4E Flash' }))
  await userEvent.selectOptions(reopened.getByRole('combobox', { name: 'Variant' }), variant)
  expect(reopened.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
  await userEvent.click(reopened.getByRole('button', { name: 'Set up FastFlowLM' }))
  const settings = within(screen.getByRole('dialog', { name: 'fastflowlm settings' }))
  verdict = { verdict: 'ok', reason: '' }
  await userEvent.click(settings.getByRole('button', { name: 'Close' }))
  expect(await reopened.findByRole('button', { name: 'Download' })).toBeEnabled()
  expect(reopened.getByRole('combobox', { name: 'Variant' })).toHaveValue(variant)
  expect(execute).toHaveBeenCalledWith('models.search', { engine: 'fastflowlm', query: modelId })
  await userEvent.click(reopened.getByRole('button', { name: 'Download' }))
  await screen.findByRole('heading', { name: 'Permissions' })
  expect(execute).toHaveBeenCalledWith('fastflowlm.plan', { model: modelId, variant })
  expect(execute).toHaveBeenCalledWith(
    'fastflowlm.install',
    expect.objectContaining({ plan_digest: 'flm-plan' })
  )
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'tui.model': variant } })
})
