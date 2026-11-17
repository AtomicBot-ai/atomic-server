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
  'shows a %s notification response inline after one explicit click',
  async (permission) => {
    const requestPermission = vi.fn().mockResolvedValue(permission)
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    render(<Permissions />)
    expect(requestPermission).not.toHaveBeenCalled()
    const allow = screen.getByRole('button', { name: 'Allow notifications' })
    await userEvent.click(allow)
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(await screen.findByRole('alert')).toHaveTextContent('Notifications were not allowed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
    expect(allow).toBeEnabled()
  }
)
it('explains missing notification support without offering a request', () => {
  vi.stubGlobal('Notification', undefined)
  render(<Permissions />)
  expect(screen.getByText('Unavailable in this browser.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Allow notifications' })).not.toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})
it('reports unexpected notification request failures and leaves the action usable', async () => {
  const error = new TypeError('Notification permission request failed')
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockRejectedValue(error),
  })
  render(<Permissions />)
  const allow = screen.getByRole('button', { name: 'Allow notifications' })
  await userEvent.click(allow)
  expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/api/client-errors',
    expect.objectContaining({ method: 'POST' })
  )
  expect(allow).toBeEnabled()
})
it('can grant notifications after an earlier refusal without reporting a browser defect', async () => {
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValueOnce('denied').mockResolvedValueOnce('granted'),
  })
  render(<Permissions />)
  const allow = screen.getByRole('button', { name: 'Allow notifications' })
  await userEvent.click(allow)
  expect(await screen.findByRole('alert')).toHaveTextContent('Notifications were not allowed')
  await userEvent.click(allow)
  expect(screen.getByRole('status')).toHaveTextContent('Allowed')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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
  render(<Permissions />)
  expect(screen.getByText('Notifications')).toBeInTheDocument()
  expect(screen.queryByText('Microphone')).not.toBeInTheDocument()
})
