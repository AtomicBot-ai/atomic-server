import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { createServiceHub } from '@/services'
import type { EventSourceFactory } from '@/services/events'
import { FakeEventSource } from '@/test/fake-event-source'
import { workspaceFixture } from '@/test/workspace-fixture'
import type { Workspace } from './useWorkspace'
import { WorkspaceApp } from './WorkspaceApp'
import { ConnectionGuide } from './server/ConnectionGuide'

let current: Workspace
vi.mock('./useWorkspace', () => ({ useWorkspace: () => current }))
beforeEach(() => {
  initializeServiceHubStore(
    createServiceHub({ eventSource: FakeEventSource as unknown as EventSourceFactory })
  )
  current = workspaceFixture({
    'models.installed': [{ id: 'qwen', name: 'Qwen', providers: ['llamacpp-upstream'] }],
    'models.catalog': [],
  }).workspace
})

it('Escape returns Settings to the previous model section', async () => {
  render(<WorkspaceApp />)
  const main = within(await screen.findByRole('navigation', { name: 'Main' }))
  await userEvent.click(main.getByRole('button', { name: 'Models' }))
  await userEvent.click(screen.getByRole('button', { name: 'Downloads', exact: true }))
  await userEvent.click(main.getByRole('button', { name: 'Settings' }))
  await userEvent.click(screen.getByRole('button', { name: 'Assistants', exact: true }))
  await userEvent.keyboard('{Escape}')
  expect(main.getByRole('button', { name: 'Models' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'Downloads', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  expect(screen.queryByRole('navigation', { name: 'Settings sections' })).not.toBeInTheDocument()
})

it('Escape closes an agent guide directly to the server section that opened it', async () => {
  render(<WorkspaceApp />)
  await screen.findByRole('navigation', { name: 'Main' })
  await userEvent.click(screen.getByRole('button', { name: 'Configuration', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Codex CLI', exact: true }))
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('heading', { name: 'Configuration', exact: true })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Choose your agent' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'What would you like to connect?' })).not.toBeInTheDocument()
})

it('Escape dismisses a nested model picker before closing the guide', async () => {
  const close = vi.fn()
  render(<ConnectionGuide workspace={current} initialAgent="codex" onClose={close} onSettings={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Choose a local model' }))
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Choose a model for this connection' })).not.toBeInTheDocument()
  expect(close).not.toHaveBeenCalled()
  await userEvent.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
})
