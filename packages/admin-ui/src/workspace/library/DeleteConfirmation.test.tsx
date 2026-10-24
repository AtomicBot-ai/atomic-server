import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DeleteConfirmation } from './DeleteConfirmation'

it('keeps a pending deletion open and exposes a late failure before allowing retry or dismissal', async () => {
  let reject!: (reason: Error) => void
  const remove = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    .mockResolvedValueOnce({})
  const close = vi.fn()
  render(
    <DeleteConfirmation
      title="Remove download?"
      name="Selected model"
      detail="Partial files will be deleted."
      confirm="Remove download"
      onConfirm={remove}
      onClose={close}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Remove download' }))
  await waitFor(() => expect(remove).toHaveBeenCalledOnce())
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  expect(close).not.toHaveBeenCalled()
  await act(async () => reject(new Error('The download could not be removed. Try again.')))
  expect(await screen.findByRole('alert')).toHaveTextContent('The download could not be removed.')
  expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-busy')
  expect(screen.getByRole('button', { name: 'Keep it' })).toBeEnabled()
  expect(close).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Remove download' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(remove).toHaveBeenCalledTimes(2)
})
