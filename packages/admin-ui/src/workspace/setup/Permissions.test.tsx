import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { Permissions } from './Permissions'
import { Destinations } from './Purpose'

afterEach(() => vi.unstubAllGlobals())
it('reports a denied notification request without showing Allowed', async () => {
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('denied'),
  })
  const granted = vi.fn()
  render(<Permissions onGranted={granted} />)
  await userEvent.click(screen.getAllByRole('button', { name: 'Allow', exact: true })[0])
  await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Notifications were not allowed')
  expect(granted).not.toHaveBeenCalledWith(true)
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Allow', exact: true })).toHaveLength(1)
})
it('keeps a failed destination handoff on its current screen with a retryable error', async () => {
  const choose = vi.fn().mockRejectedValueOnce(new Error('Server unavailable')).mockResolvedValue(undefined)
  render(<Destinations choose={choose} />)
  await userEvent.click(screen.getByRole('button', { name: /Configure an endpoint/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable')
  await userEvent.click(screen.getByRole('button', { name: /Configure an endpoint/ }))
  expect(choose).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

// The web admin has no voice input: it asks for nothing it will not use.
it('asks for notifications only', () => {
  render(<Permissions onGranted={vi.fn()} />)
  expect(screen.getByText('Notifications')).toBeInTheDocument()
  expect(screen.queryByText('Microphone')).not.toBeInTheDocument()
})
