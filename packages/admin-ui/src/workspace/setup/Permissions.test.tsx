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
  expect(screen.getAllByRole('button', { name: 'Allow', exact: true })).toHaveLength(2)
})
it('closes microphone tracks immediately after a successful permission request', async () => {
  const stop = vi.fn()
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
  const previous = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  try {
    const granted = vi.fn()
    render(<Permissions onGranted={granted} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Allow', exact: true })[1])
    await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
    expect(await screen.findByRole('button', { name: 'Allowed' })).toBeInTheDocument()
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(stop).toHaveBeenCalledOnce()
    expect(granted).toHaveBeenCalledWith(true)
  } finally {
    if (previous) Object.defineProperty(navigator, 'mediaDevices', previous)
    else Reflect.deleteProperty(navigator, 'mediaDevices')
  }
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
