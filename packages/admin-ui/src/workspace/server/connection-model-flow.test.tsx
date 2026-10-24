import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from '../setup/SetupWizard'
import type { Workspace } from '../useWorkspace'
import { Server } from './Server'
import { ConnectionGuide } from './ConnectionGuide'

const oldModel = { id: 'old-model', name: 'Old model', providers: ['llamacpp-upstream'] }
const newModel = { id: 'new-model', name: 'New model', providers: ['llamacpp-upstream'] }
const answers = {
  'models.installed': [oldModel, newModel],
  'models.catalog': [{ id: 'repo/new', name: 'Available model' }],
  'models.files': [{ filename: 'new.gguf', size: 500 }],
  'models.plan': { digest: 'plan', provider: 'llamacpp-upstream', model_id: 'new-model', blockers: [] },
  'models.install': { setup_id: 'download', plan: { model_id: 'new-model' } },
  'keys.list': [{ id: 'key' }],
  'connection.info': { endpoint: 'http://127.0.0.1:1337/v1' },
  'connection.profile': { launch_command: 'atc connect codex --model new-model' },
}
function FirstRunHandoff({ workspace }: { workspace: Workspace }) {
  const [setup, setSetup] = useState(true)
  return setup ? (
    <SetupWizard
      workspace={workspace}
      onClose={vi.fn()}
      onOpenGoal={vi.fn()}
      onDestination={() => setSetup(false)}
    />
  ) : (
    <Server section="overview" workspace={workspace} openCommand={vi.fn()} openSetup={vi.fn()} />
  )
}
async function openOnboardingReview(name = 'Old model') {
  if (name !== 'Old model')
    await userEvent.click(await screen.findByRole('button', { name: `${name} Downloaded` }))
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: /Connect an agent/ }))
  await userEvent.click(
    within(screen.getByRole('heading', { name: 'Codex CLI' }).closest('article')!).getByRole('button', {
      name: 'Configure',
    })
  )
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
}
it('changes models inside onboarding without losing the selected agent or visiting a previous stage', async () => {
  const { workspace, execute } = workspaceFixture(answers, { setup: null })
  render(<FirstRunHandoff workspace={workspace} />)
  await openOnboardingReview()
  await userEvent.click(screen.getByRole('button', { name: 'Choose a local model' }))
  await userEvent.click(await screen.findByRole('button', { name: 'New model Downloaded' }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue('new-model'))
  expect(screen.queryByRole('dialog', { name: 'Choose a model for this connection' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Cloud providers' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  expect(await screen.findByRole('heading', { name: 'Codex CLI connection is ready' })).toBeInTheDocument()
  expect(execute).toHaveBeenCalledWith('connection.profile', {
    agent: 'codex',
    model: 'new-model',
    key_id: 'key',
  })
})
it('returns a new background download to the same review without silently using another model', async () => {
  let installed = [oldModel]
  const { workspace, execute } = workspaceFixture({ ...answers, 'models.installed': () => installed })
  const guide = (value = workspace) => (
    <ConnectionGuide workspace={value} initialAgent="codex" onClose={vi.fn()} onSettings={vi.fn()} />
  )
  const view = render(guide())
  await userEvent.click(await screen.findByRole('button', { name: 'Choose a local model' }))
  await userEvent.click(await screen.findByRole('button', { name: /Available model/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue('new-model'))
  expect(screen.queryByRole('dialog', { name: 'Choose a model for this connection' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
  installed = [oldModel, newModel]
  view.rerender(
    guide({
      ...workspace,
      snapshot: { ...workspace.snapshot!, setups: [{ id: 'download', stage: 'ready' }] },
    })
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  await screen.findByRole('heading', { name: 'Codex CLI connection is ready' })
  expect(execute).toHaveBeenCalledWith('models.load', {
    provider: 'llamacpp-upstream',
    model_id: 'new-model',
  })
})
it('keeps a failed model check inside the picker and retries without changing onboarding stage', async () => {
  let failing = true
  const { workspace, execute } = workspaceFixture(
    {
      ...answers,
      'models.plan': () => {
        if (failing) throw new Error('Model service unavailable')
        return answers['models.plan']
      },
    },
    { setup: null }
  )
  render(<FirstRunHandoff workspace={workspace} />)
  await openOnboardingReview()
  await userEvent.click(screen.getByRole('button', { name: 'Choose a local model' }))
  await userEvent.click(await screen.findByRole('button', { name: /Available model/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Model service unavailable')
  expect(execute).not.toHaveBeenCalledWith('models.install', expect.anything())
  failing = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue('new-model'))
  expect(screen.queryByRole('dialog', { name: 'Choose a model for this connection' })).not.toBeInTheDocument()
  expect(execute.mock.calls.filter(([name]) => name === 'models.install')).toHaveLength(1)
})
it('explicit picker Back preserves endpoint settings and the current model', async () => {
  const { workspace } = workspaceFixture(answers)
  render(<ConnectionGuide workspace={workspace} onClose={vi.fn()} onSettings={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: /Configure an endpoint/ }))
  await userEvent.clear(screen.getByLabelText('Server port'))
  await userEvent.type(screen.getByLabelText('Server port'), '1777')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await userEvent.click(screen.getByRole('button', { name: 'Choose a local model' }))
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('heading', { name: 'Review your endpoint' })).toBeInTheDocument()
  expect(screen.getByLabelText('Model')).toHaveValue('old-model')
  expect(screen.getByText('http://127.0.0.1:1777/v1')).toBeInTheDocument()
})

it('preserves the selected installed model through onboarding handoff and guide reopening', async () => {
  let savedModel = ''
  const { workspace, execute } = workspaceFixture(
    {
      ...answers,
      'config.update': (input: Record<string, unknown>) => {
        const values = input.values as Record<string, unknown>
        if (values['tui.model']) savedModel = String(values['tui.model'])
        return {}
      },
      'config.get': () => ({ values: { tui: { model: savedModel } } }),
    },
    { setup: null }
  )
  render(<FirstRunHandoff workspace={workspace} />)
  await openOnboardingReview('New model')
  await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue('new-model'))
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'tui.model': 'new-model' } })
  await userEvent.click(screen.getByRole('button', { name: 'Close setup guide' }))
  await userEvent.click(
    within(screen.getByRole('heading', { name: 'Codex CLI' }).closest('article')!).getByRole('button', {
      name: 'Configure',
    })
  )
  await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue('new-model'))
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  await screen.findByRole('heading', { name: 'Codex CLI connection is ready' })
  expect(execute).toHaveBeenCalledWith('models.load', {
    provider: 'llamacpp-upstream',
    model_id: 'new-model',
  })
})

it('saves the actual download model before handoff instead of restoring a previous installed choice', async () => {
  const downloadedId = 'repo/new/new.gguf'
  let savedModel = 'old-model',
    finishSave!: () => void
  const { workspace, execute } = workspaceFixture(
    {
      ...answers,
      'models.installed': [oldModel],
      'models.install': { setup_id: 'download', plan: { model_id: downloadedId } },
      'config.get': () => ({ values: { tui: { model: savedModel } } }),
      'config.update': (input: Record<string, unknown>) =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            savedModel = String((input.values as Record<string, unknown>)['tui.model'])
            resolve()
          }
        }),
    },
    { setup: null }
  )
  render(<FirstRunHandoff workspace={workspace} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Available model' }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(finishSave).toBeDefined())
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'tui.model': downloadedId } })
  expect(screen.queryByRole('heading', { name: 'Permissions' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('dialog', { name: 'Install model' })).toBeInTheDocument()
  await act(async () => finishSave())
  await screen.findByRole('heading', { name: 'Permissions' })
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: /Connect an agent/ }))
  await userEvent.click(
    within(screen.getByRole('heading', { name: 'Codex CLI' }).closest('article')!).getByRole('button', {
      name: 'Configure',
    })
  )
  await waitFor(() => expect(screen.getByLabelText('Model')).toHaveValue(downloadedId))
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
  expect(execute.mock.calls.filter(([name]) => name === 'models.install')).toHaveLength(1)
})
