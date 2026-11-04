import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ChatFailure } from './ChatFailure'

it.each(['401 Unauthorized', 'Invalid API key', 'Authentication failed'])(
  'routes credential recovery to providers (%s)',
  async (error) => {
    const onCatalog = vi.fn()
    render(<ChatFailure error={error} onCatalog={onCatalog} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Check its credentials and retry.')
    expect(screen.getByText('Error details').parentElement).not.toHaveAttribute('open')
    expect(screen.queryByRole('button', { name: 'Reconnect to server' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect provider' }))
    expect(onCatalog).toHaveBeenCalledWith('cloud')
  }
)

it('keeps engine errors actionable and transport reconnection distinct', async () => {
  const onCatalog = vi.fn()
  const view = render(<ChatFailure error="Engine out of memory" onCatalog={onCatalog} />)
  await userEvent.click(screen.getByRole('button', { name: 'Engines & Models' }))
  expect(onCatalog).toHaveBeenCalledWith(undefined)
  expect(screen.queryByRole('button', { name: 'Reconnect to server' })).not.toBeInTheDocument()
  view.rerender(<ChatFailure error="Network connection lost" onCatalog={onCatalog} />)
  expect(screen.getByRole('button', { name: 'Reconnect to server' })).toBeInTheDocument()
})
