import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { FileInput } from './FileInput'

it('uses an English trigger and hides browser-localized file text', async () => {
  render(<FileInput label="Import settings" accept=".json" onChange={vi.fn()} />)
  const native = screen.getByLabelText('Import settings')
  expect(native).not.toBeVisible()
  expect(screen.getByText('No file selected')).toBeVisible()
  const open = vi.spyOn(native, 'click')
  await userEvent.click(screen.getByRole('button', { name: 'Choose file Import settings' }))
  expect(open).toHaveBeenCalledOnce()
})

it('shows the selected name, locks while reading and permits choosing the same file again', async () => {
  let finish!: () => void
  const change = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  render(<FileInput label="Import settings" accept=".json" onChange={change} />)
  const native = screen.getByLabelText('Import settings')
  const file = new File(['{}'], 'settings.json', { type: 'application/json' })
  await userEvent.upload(native, file)
  expect(screen.getByText('settings.json')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Choose file Import settings' })).toBeDisabled()
  await act(async () => finish())
  await userEvent.upload(native, file)
  expect(change).toHaveBeenCalledTimes(2)
  await act(async () => finish())
})

it('keeps disabled controls inert and associates the helper text', () => {
  const change = vi.fn()
  render(<FileInput label="Source image" disabled hint="PNG or JPEG" onChange={change} />)
  expect(screen.getByRole('button', { name: 'Choose file Source image' })).toBeDisabled()
  expect(screen.getByLabelText('Source image')).toBeDisabled()
  expect(screen.getByLabelText('Source image')).toHaveAccessibleDescription('PNG or JPEG')
})
