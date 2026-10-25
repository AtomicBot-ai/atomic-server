import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from './SetupWizard'

const pending = snapshotFixture({
  setup: null,
  setups: [{ id: 'job', stage: 'interrupted', plan: { model_id: 'model' } }] as never,
})
vi.mock('../workspace-api', () => ({ workspaceApi: { snapshot: vi.fn(async () => pending) } }))

it('reads the server before choosing a destination when its first snapshot has not arrived', async () => {
  const { workspace } = workspaceFixture({
    'models.installed': [{ id: 'local-model', name: 'Local model', providers: ['llamacpp-upstream'] }],
    'models.catalog': [],
  })
  workspace.snapshot = null as never
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} onWelcome={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(await screen.findByRole('button', { name: /Configure an endpoint/ }))
  // The waiting screen, not the server page: its heading follows the next snapshot on its own.
  expect(await screen.findByLabelText('Email me when it is ready')).toBeInTheDocument()
  expect(workspace.execute).not.toHaveBeenCalledWith('setup.manual', expect.anything())
})
