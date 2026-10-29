import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { WorkspaceSnapshot } from '@contract'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from './SetupWizard'

const pending = snapshotFixture({
  setup: null,
  setups: [{ id: 'job', stage: 'interrupted', plan: { model_id: 'model' } }] as never,
})

/** The wizard at its destination step, with the server answering `refresh` as `answer` does. */
async function reachDestinations(
  answer: () => Promise<WorkspaceSnapshot | null>,
  stale: WorkspaceSnapshot | null
) {
  const { workspace } = workspaceFixture(
    {
      'models.installed': [{ id: 'local-model', name: 'Local model', providers: ['llamacpp-upstream'] }],
      'models.catalog': [],
    },
    { setup: null }
  )
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} onWelcome={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  workspace.snapshot = stale as never
  workspace.refresh = vi.fn(answer)
  return workspace
}
const manual = (w: Awaited<ReturnType<typeof reachDestinations>>) =>
  vi.mocked(w.execute).mock.calls.filter(([name]) => name === 'setup.manual')

it.each([
  ['its first snapshot has not arrived', null],
  ['its last snapshot does not list the download yet', snapshotFixture({ setup: null })],
])('reads the server before choosing a destination when %s', async (_name, stale) => {
  const workspace = await reachDestinations(async () => pending, stale)
  await userEvent.click(await screen.findByRole('button', { name: /Configure an endpoint/ }))
  // The waiting screen, not the server page: its heading follows the refreshed snapshot on its own.
  expect(await screen.findByRole('region', { name: 'Minesweeper' })).toBeInTheDocument()
  expect(manual(workspace)).toHaveLength(0)
})

it('waits when the server cannot say whether the first model is ready', async () => {
  await reachDestinations(async () => null, snapshotFixture({ setup: null }))
  await userEvent.click(await screen.findByRole('button', { name: /Configure an endpoint/ }))
  expect(await screen.findByRole('region', { name: 'Minesweeper' })).toBeInTheDocument()
})

it('chooses once while it reads the server', async () => {
  let answer!: (value: WorkspaceSnapshot) => void
  const workspace = await reachDestinations(
    () => new Promise((resolve) => (answer = resolve)),
    snapshotFixture({ setup: null })
  )
  await userEvent.dblClick(await screen.findByRole('button', { name: /Configure an endpoint/ }))
  answer(snapshotFixture({ setup: null, setups: [] }))
  await vi.waitFor(() => expect(manual(workspace)).toHaveLength(1))
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(manual(workspace)).toHaveLength(1)
})
