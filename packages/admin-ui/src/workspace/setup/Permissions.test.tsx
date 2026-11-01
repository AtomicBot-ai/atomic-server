import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Permissions } from './Permissions'
import { Destinations } from './Purpose'

beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 202 }))
  )
)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
it.each(['denied', 'default'])(
  'shows a %s notification response without reporting a browser defect',
  async (permission) => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue(permission),
    })
    const granted = vi.fn()
    render(<Permissions onGranted={granted} />)
    await userEvent.click(screen.getAllByRole('button', { name: 'Allow', exact: true })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications were not allowed')
    expect(granted).not.toHaveBeenCalledWith(true)
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Allow access' })).toBeEnabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Allow', exact: true })).toHaveLength(1)
  }
)
it('explains missing notification support without reporting a browser defect', async () => {
  vi.stubGlobal('Notification', undefined)
  const granted = vi.fn()
  render(<Permissions onGranted={granted} />)
  await userEvent.click(screen.getByRole('button', { name: 'Allow', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Notifications are unavailable')
  expect(granted).not.toHaveBeenCalledWith(true)
  expect(fetch).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Not now' })).toBeEnabled()
})
it('reports unexpected notification request failures and leaves the dialog usable', async () => {
  const error = new TypeError('Notification permission request failed')
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockRejectedValue(error),
  })
  const granted = vi.fn()
  render(<Permissions onGranted={granted} />)
  await userEvent.click(screen.getByRole('button', { name: 'Allow', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/client-errors',
    expect.objectContaining({ method: 'POST' })
  )
  expect(granted).not.toHaveBeenCalledWith(true)
  expect(screen.getByRole('button', { name: 'Allow access' })).toBeEnabled()
})
it('can grant notifications after an earlier refusal without reporting a browser defect', async () => {
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValueOnce('denied').mockResolvedValueOnce('granted'),
  })
  const granted = vi.fn()
  render(<Permissions onGranted={granted} />)
  await userEvent.click(screen.getAllByRole('button', { name: 'Allow', exact: true })[0])
  await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Notifications were not allowed')
  await userEvent.click(screen.getByRole('button', { name: 'Allow access' }))
  expect(granted).toHaveBeenCalledWith(true)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Allowed/ })).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
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
