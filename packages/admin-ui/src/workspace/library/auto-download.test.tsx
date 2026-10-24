import { act, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import userEvent from '@testing-library/user-event'
import { SetupWizard } from '../setup/SetupWizard'
import { ModelInstall } from './ModelInstall'
it('does not auto-download an incompatible model', async () => {
  const { execute } = workspaceFixture({
    'artifacts.plan': { digest: 'p1', blockers: ['Not enough disk space'] },
  })
  render(
    <ModelInstall
      autoStart
      model={{ id: 'image' }}
      category="image"
      execute={execute as never}
      onClose={vi.fn()}
    />
  )
  expect(await screen.findByText('Not enough disk space')).toBeInTheDocument()
  expect(execute).not.toHaveBeenCalledWith('artifacts.install', expect.anything())
})
it('auto-downloads a valid media plan once across rerenders', async () => {
  const { execute } = workspaceFixture({
    'artifacts.plan': { digest: 'p1', blockers: [] },
    'artifacts.install': { id: 'job' },
  })
  const close = vi.fn()
  const ui = render(
    <ModelInstall
      autoStart
      model={{ id: 'image' }}
      category="image"
      execute={execute as never}
      onClose={close}
    />
  )
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  ui.rerender(
    <ModelInstall
      autoStart
      model={{ id: 'image' }}
      category="image"
      execute={execute as never}
      onClose={close}
    />
  )
  expect(execute.mock.calls.filter(([name]) => name === 'artifacts.install')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Download', exact: true })).not.toBeInTheDocument()
})

it('does not advance onboarding when a dismissed download responds after another model is chosen', async () => {
  const completions = new Map<string, (value: object) => void>()
  const { workspace, execute } = workspaceFixture(
    {
      'models.installed': [],
      'models.catalog': [
        { id: 'repo/first', name: 'First model' },
        { id: 'repo/second', name: 'Second model' },
      ],
      'models.files': [{ filename: 'model.gguf', size: 100 }],
      'models.plan': (input: Record<string, unknown>) => ({
        digest: input.repo,
        blockers: [],
        provider: 'llamacpp-upstream',
      }),
      'models.install': (input: { request: { repo: string } }) =>
        new Promise((resolve) => completions.set(input.request.repo, resolve)),
    },
    { setup: null }
  )
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: /First model/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(completions.has('repo/first')).toBe(true))
  await userEvent.keyboard('{Escape}')
  await userEvent.click(await screen.findByRole('button', { name: /Second model/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await waitFor(() => expect(completions.has('repo/second')).toBe(true))
  await act(async () => completions.get('repo/first')!({ setup_id: 'first', plan: { model_id: 'first' } }))
  expect(screen.getByRole('dialog', { name: 'Install model' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Second model' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Permissions' })).not.toBeInTheDocument()
  await act(async () => completions.get('repo/second')!({ setup_id: 'second', plan: { model_id: 'second' } }))
  expect(await screen.findByRole('heading', { name: 'Permissions' })).toBeInTheDocument()
  expect(execute.mock.calls.filter(([name]) => name === 'models.install')).toHaveLength(2)
})
