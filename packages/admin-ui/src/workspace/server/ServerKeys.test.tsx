import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ServerKeys } from './ServerKeys'

const keys = [
  { id: 'first', name: 'Terminal', preview: 'atc_…1111', createdAt: 1 },
  { id: 'second', name: 'Browser', preview: 'atc_…2222', createdAt: 2 },
]

it('cancels revocation with Escape or Cancel without calling the server and restores focus', async () => {
  const { workspace, execute } = workspaceFixture({}, { keys })
  render(<ServerKeys workspace={workspace} />)
  const trigger = within(screen.getByRole('row', { name: /Terminal/ })).getByRole('button', {
    name: 'Revoke',
  })
  await userEvent.click(trigger)
  const dialog = await screen.findByRole('dialog', { name: 'Revoke API key?' })
  expect(dialog).toHaveFocus()
  expect(dialog).toHaveTextContent('Terminal')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(execute).not.toHaveBeenCalled()
  await userEvent.click(trigger)
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalled()
})

it('revokes only the confirmed key and keeps the dialog locked while the request is pending', async () => {
  let finish!: () => void
  const { workspace, execute } = workspaceFixture(
    {
      'keys.revoke': () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    },
    { keys }
  )
  render(<ServerKeys workspace={workspace} />)
  await userEvent.click(
    within(screen.getByRole('row', { name: /Browser/ })).getByRole('button', { name: 'Revoke' })
  )
  const dialog = await screen.findByRole('dialog', { name: 'Revoke API key?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke key' }))
  expect(execute).toHaveBeenCalledExactlyOnceWith('keys.revoke', { id: 'second' })
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Revoke key' })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  expect(dialog).toBeInTheDocument()
  await act(async () => finish())
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('keeps a failed revoke visible for retry and protects the last key', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      'keys.revoke': () => {
        throw new Error('Key is in use. Try again.')
      },
    },
    { keys }
  )
  const view = render(<ServerKeys workspace={workspace} />)
  await userEvent.click(screen.getAllByRole('button', { name: 'Revoke', exact: true })[0])
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke key' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Key is in use. Try again.')
  expect(screen.getByRole('button', { name: 'Revoke key' })).toBeEnabled()
  expect(execute).toHaveBeenCalledOnce()
  await userEvent.keyboard('{Escape}')
  workspace.snapshot = { ...workspace.snapshot!, keys: [keys[0]] }
  view.rerender(<ServerKeys workspace={workspace} />)
  expect(screen.getByRole('button', { name: 'Revoke', exact: true })).toBeDisabled()
})
