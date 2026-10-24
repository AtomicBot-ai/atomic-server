import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from './SetupWizard'
import { ConnectionGuide } from '../server/ConnectionGuide'
const model = { id: 'local-model', name: 'Local model', providers: ['llamacpp-upstream'] }
const answers = {
  'models.installed': [model],
  'models.catalog': [{ id: 'repo/model', name: 'Available model' }],
  'keys.list': [{ id: 'key' }],
  'connection.info': { endpoint: 'http://127.0.0.1:1337/v1' },
  'connection.profile': { launch_command: 'atc connect codex --model local-model' },
}
it('keeps model navigation in one footer with keyboard access to Back, Skip setup, and Continue', async () => {
  const { workspace, execute } = workspaceFixture(answers, { setup: null })
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} onWelcome={vi.fn()} />)
  const back = screen.getByRole('button', { name: 'Back', exact: true })
  const footer = back.closest('footer')!
  await waitFor(() => expect(within(footer).getByRole('button', { name: 'Continue' })).toBeEnabled())
  expect(
    within(footer)
      .getAllByRole('button')
      .map((button) => button.textContent)
  ).toEqual(['Back', 'Skip setup', 'Continue'])
  expect(screen.getAllByRole('button', { name: 'Continue' })).toHaveLength(1)
  const rects = vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as unknown as DOMRectList)
  try {
    back.focus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Skip setup' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
  } finally {
    rects.mockRestore()
  }
  expect(await screen.findByRole('heading', { name: 'Permissions' })).toBeInTheDocument()
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'tui.model': 'local-model' } })
})
it('keeps the desktop controls while going directly from media to server destinations', async () => {
  const { workspace, execute } = workspaceFixture(answers, { setup: null })
  const destination = vi.fn()
  render(
    <SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} onDestination={destination} />
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  expect(screen.getByRole('heading', { name: 'Permissions' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Back', exact: true }))
  expect(screen.getByRole('heading', { name: 'Choose your first model' })).toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  expect(screen.getByRole('dialog', { name: 'Continue without permissions?' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('heading', { name: 'Permissions' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  expect(screen.getByRole('heading', { name: 'Cloud providers' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  expect(screen.queryByRole('button', { name: /Everyday use/ })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'How will you use Atomic Server?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Connect an agent/ })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Configure an endpoint/ }))
  await waitFor(() => expect(destination).toHaveBeenCalledWith('endpoint'))
  expect(execute).toHaveBeenCalledWith('setup.manual')
  expect(execute).not.toHaveBeenCalledWith('setup.complete', expect.anything())
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
})
it('records Skip setup without claiming a working model or downloading anything', async () => {
  const { workspace, execute } = workspaceFixture({}, { setup: null })
  const close = vi.fn()
  render(<SetupWizard workspace={workspace} onClose={close} onOpenGoal={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Skip setup' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(execute).toHaveBeenCalledWith('setup.manual')
  expect(execute).not.toHaveBeenCalledWith('models.install', expect.anything())
})
it('continues onboarding after an automatic download while preserving download controls', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      ...answers,
      'models.files': [{ filename: 'model.gguf', size: 500 }],
      'models.plan': {
        digest: 'digest',
        provider: 'llamacpp-upstream',
        total_download_bytes: 500,
        blockers: [],
      },
      'models.install': { setup_id: 'job', plan: { model_id: 'local-model' } },
    },
    { setup: null }
  )
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: /Available model/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(await screen.findByRole('heading', { name: 'Permissions' })).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Install model' })).not.toBeInTheDocument()
  expect(execute.mock.calls.filter(([name]) => name === 'models.install')).toHaveLength(1)
  expect(execute).toHaveBeenCalledWith('models.install', expect.objectContaining({ plan_digest: 'digest' }))
})
it('configures the endpoint only after review and verifies before reporting success', async () => {
  const { workspace, execute } = workspaceFixture(answers)
  render(<ConnectionGuide workspace={workspace} onClose={vi.fn()} onSettings={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: /Configure an endpoint/ }))
  await userEvent.clear(screen.getByLabelText('Server port'))
  await userEvent.type(screen.getByLabelText('Server port'), '70000')
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await userEvent.clear(screen.getByLabelText('Server port'))
  await userEvent.type(screen.getByLabelText('Server port'), '1777')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(execute).not.toHaveBeenCalledWith('api.restart', expect.anything())
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  expect(await screen.findByRole('heading', { name: 'Your endpoint is ready' })).toBeInTheDocument()
  const operations = execute.mock.calls.map(([name]) => name)
  expect(operations.indexOf('models.load')).toBeLessThan(operations.indexOf('api.restart'))
  expect(operations.indexOf('api.restart')).toBeLessThan(operations.indexOf('setup.complete'))
  expect(execute).toHaveBeenCalledWith('api.restart', { request: { host: '127.0.0.1', port: 1777 } })
  expect(operations).not.toContain('connection.profile')
})
it('keeps failed verification in review and allows retry without claiming success', async () => {
  let fails = true
  const { workspace, execute } = workspaceFixture({
    ...answers,
    'setup.complete': () => {
      if (fails) throw new Error('Inference failed')
    },
  })
  render(
    <ConnectionGuide
      workspace={workspace}
      initialAgent="codex"
      onClose={vi.fn()}

      onSettings={vi.fn()}
    />
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Inference failed')
  expect(execute).not.toHaveBeenCalledWith('connection.profile', expect.anything())
  fails = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
  expect(await screen.findByRole('heading', { name: 'Codex CLI connection is ready' })).toBeInTheDocument()
  expect(execute).toHaveBeenCalledWith('connection.profile', {
    agent: 'codex',
    model: 'local-model',
    key_id: 'key',
  })
  expect(screen.queryByText('Codex CLI is connected')).not.toBeInTheDocument()
})
