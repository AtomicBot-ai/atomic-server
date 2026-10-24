import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ConnectionGuide } from './ConnectionGuide'

const model = { id: 'chosen-model', providers: ['llamacpp-upstream'] }
it('retries an unavailable model list without leaving the selected agent', async () => {
  let attempts = 0
  const { workspace, execute } = workspaceFixture({
    'models.installed': () => {
      if (!attempts++) throw new Error('Model list unavailable. Try again.')
      return [model]
    },
  })
  render(
    <ConnectionGuide
      workspace={workspace}
      initialAgent="codex"
      preferredModel="chosen-model"
      onClose={vi.fn()}
      onSettings={vi.fn()}
    />
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Model list unavailable. Try again.')
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Retry model check' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
  expect(screen.getByLabelText('Model')).toHaveValue('chosen-model')
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
})

it('blocks stale model readiness while a refresh is pending or failed and preserves the draft', async () => {
  let reject!: (error: Error) => void
  let delayed = false
  const { workspace, execute } = workspaceFixture({
    'models.installed': () => (delayed ? new Promise((_, fail) => (reject = fail)) : [model]),
  })
  const guide = (value = workspace) => (
    <ConnectionGuide
      workspace={value}
      initialAgent="codex"
      preferredModel="chosen-model"
      onClose={vi.fn()}
      onSettings={vi.fn()}
    />
  )
  const view = render(guide())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  delayed = true
  view.rerender(
    guide({
      ...workspace,
      snapshot: { ...workspace.snapshot!, setups: [{ id: 'download', stage: 'ready' }] },
    })
  )
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Checking downloaded models')
  await act(async () => reject(new Error('Model list unavailable')))
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  expect(screen.getByLabelText('Model')).toHaveValue('chosen-model')
  expect(screen.getByRole('status')).toHaveTextContent('Retry the model check to continue.')
  delayed = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry model check' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
})

it('keeps model and settings navigation locked during preparation and restores it after failure', async () => {
  let reject!: (error: Error) => void
  const settings = vi.fn()
  const { workspace } = workspaceFixture({
    'models.installed': [model],
    'models.load': () => new Promise((_, fail) => (reject = fail)),
  })
  render(
    <ConnectionGuide workspace={workspace} initialAgent="codex" onClose={vi.fn()} onSettings={settings} />
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  await userEvent.click(screen.getByText('Where do I change server settings?'))
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  const modelSettings = screen.getByRole('button', { name: 'Engine & model' })
  const serverSettings = screen.getByRole('button', { name: 'Server configuration' })
  expect(modelSettings).toBeDisabled()
  expect(serverSettings).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close setup guide' })).toBeDisabled()
  await userEvent.click(modelSettings)
  await userEvent.click(serverSettings)
  expect(settings).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Choose a model for this connection' })).not.toBeInTheDocument()
  await act(async () => reject(new Error('Model could not be loaded')))
  expect(modelSettings).toBeEnabled()
  expect(serverSettings).toBeEnabled()
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
})

it('keeps unknown model availability neutral and restores keyboard focus after failed and successful retries', async () => {
  let reject!: (error: Error) => void
  let attempts = 0
  const { workspace, execute } = workspaceFixture(
    {
      'models.installed': () => {
        if (attempts++ === 0) return new Promise((_, fail) => (reject = fail))
        if (attempts === 2) throw new Error('Model list unavailable')
        return [model]
      },
    },
    {
      setups: [
        { id: 'download', stage: 'ready', plan: { model_id: model.id, provider: 'llamacpp-upstream' } },
      ],
    }
  )
  render(
    <ConnectionGuide workspace={workspace} initialAgent="codex" onClose={vi.fn()} onSettings={vi.fn()} />
  )
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Checking…')
  expect(screen.queryByRole('button', { name: 'Play while waiting' })).not.toBeInTheDocument()
  await act(async () => reject(new Error('Model list unavailable')))
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveTextContent('Status unavailable')
  expect(screen.getByRole('combobox', { name: 'Model' })).not.toHaveTextContent('Not downloaded')
  expect(screen.queryByRole('button', { name: 'Play while waiting' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Inference engine')).toHaveValue('llamacpp-upstream')
  const retry = screen.getByRole('button', { name: 'Retry model check' })
  expect(retry).toHaveClass('primary')
  await userEvent.click(retry)
  await waitFor(() => expect(attempts).toBe(2))
  expect(retry).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  await userEvent.click(retry)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  expect(screen.getByLabelText('Model')).toHaveValue('chosen-model')
  expect(screen.getByLabelText('Model')).toHaveFocus()
  expect(screen.queryByRole('button', { name: 'Retry model check' })).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
})
