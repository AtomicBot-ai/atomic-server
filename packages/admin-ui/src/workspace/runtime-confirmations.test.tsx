import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Cockpit } from './Cockpit'
import { OperationForm } from './OperationForm'

it('confirms stop in the app, locks the pending request and retains a late failure for retry', async () => {
  let reject!: (error: Error) => void
  const pending = new Promise((_, fail) => {
    reject = fail
  })
  let attempt = 0
  const { workspace, execute } = workspaceFixture({ 'api.stop': () => (++attempt === 1 ? pending : {}) })
  render(<Cockpit workspace={workspace} navigate={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: 'Stop API' })
  await userEvent.click(trigger)
  expect(execute).not.toHaveBeenCalled()
  await userEvent.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
  await userEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Stop the API?' })
  await userEvent.dblClick(within(dialog).getByRole('button', { name: 'Stop API' }))
  expect(execute).toHaveBeenCalledTimes(1)
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  expect(dialog).toBeInTheDocument()
  await act(async () => reject(new Error('Could not stop the listener')))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Could not stop the listener')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Stop API' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(execute).toHaveBeenCalledTimes(2)
  expect(trigger).toHaveFocus()
})

it('confirms a restart and shows ping output without a browser alert', async () => {
  const { workspace, execute } = workspaceFixture({ 'api.ping': { status: 'healthy' } })
  render(<Cockpit workspace={workspace} navigate={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Restart' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restart API' }))
  expect(execute).toHaveBeenCalledWith('api.restart')
  await userEvent.click(screen.getByRole('button', { name: 'Ping' }))
  expect(screen.getByText(/"status": "healthy"/)).toBeInTheDocument()
})

it('confirms the exact interrupting command and does not execute on Cancel', async () => {
  const { workspace, execute } = workspaceFixture({})
  const operation = WORKSPACE_OPERATIONS.find((item) => item.name === 'api.restart')!
  render(
    <OperationForm operation={operation} execute={workspace.execute} initial={{ request: { port: 1400 } }} />
  )
  const trigger = screen.getByRole('button', { name: operation.title })
  await userEvent.click(trigger)
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  expect(execute).not.toHaveBeenCalled()
  expect(trigger).toHaveFocus()
  await userEvent.click(trigger)
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: operation.title }))
  expect(execute).toHaveBeenCalledWith('api.restart', { request: { port: 1400 } })
})
