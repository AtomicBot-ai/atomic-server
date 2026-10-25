import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { createServiceHub } from '@/services'
import type { EventSourceFactory } from '@/services/events'
import { FakeEventSource } from '@/test/fake-event-source'
import { workspaceFixture } from '@/test/workspace-fixture'
import type { Workspace } from '../useWorkspace'
import { WorkspaceApp } from '../WorkspaceApp'
let current: Workspace
vi.mock('../useWorkspace', () => ({ useWorkspace: () => current }))
beforeEach(() =>
  initializeServiceHubStore(
    createServiceHub({ eventSource: FakeEventSource as unknown as EventSourceFactory })
  )
)
// The complete onboarding and responsive handoff journey shares CPU with the parallel UI suite.
it('counts a connection prepared during first-run after returning to Overview', async () => {
  let finishProfile!: (value: unknown) => void
  const model = { id: 'local-model', name: 'Local model', providers: ['llamacpp-upstream'] }
  const { workspace, execute } = workspaceFixture(
    {
      'engines.list': { engines: [{ engine: 'llamacpp-upstream', active: { version: 'v1' } }] },
      'models.installed': [model],
      'models.catalog': [],
      'keys.list': [{ id: 'key' }],
      'connection.info': { endpoint: 'http://127.0.0.1:1337/v1' },
      'connection.profile': () =>
        new Promise((resolve) => {
          finishProfile = resolve
        }),
      'setup.complete': () => {
        workspace.snapshot!.setup = { mode: 'guided', complete: true, updated_at: 1 }
        return {}
      },
    },
    { setup: null }
  )
  current = workspace
  const view = render(<WorkspaceApp />)
  // Installed engines still require the explicit intro continuation before onboarding.
  await userEvent.click(await screen.findByRole('button', { name: /Press any key/ }))
  const setup = within(await screen.findByRole('dialog', { name: 'Set up Atomic Server' }))
  await userEvent.click(await setup.findByRole('button', { name: 'Continue' }))
  await userEvent.click(setup.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(setup.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(setup.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(setup.getByRole('button', { name: /Connect an agent/ }))
  expect(screen.queryByRole('dialog', { name: 'Set up Atomic Server' })).not.toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: 'Codex CLI', exact: true })[0])
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  await waitFor(() => expect(finishProfile).toBeDefined())
  view.rerender(<WorkspaceApp />)
  expect(screen.queryByRole('dialog', { name: 'Set up Atomic Server' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Preparing your server' })).toBeInTheDocument()
  await act(async () => finishProfile({ launch_command: 'atc connect codex --model local-model' }))
  expect(await screen.findByText('atc connect codex --model local-model')).toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Done', exact: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Connections.*1 prepared/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Connection prepared' })).toBeInTheDocument()
  expect(execute.mock.calls.filter(([name]) => name === 'setup.manual')).toHaveLength(1)
  Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true })
  fireEvent(window, new Event('resize'))
  await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
  expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
  expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute('aria-expanded', 'false')
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  fireEvent(window, new Event('resize'))
}, 15000)
