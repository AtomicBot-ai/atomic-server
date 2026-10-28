import { render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { RemoteAccess } from './RemoteAccess'

const missing = (cloudflared: Record<string, unknown>) => ({
  'remote.status': {
    state: 'error',
    error: 'cloudflared_unavailable',
    canStart: true,
    canStop: false,
    cloudflared: {
      found: null,
      url: 'https://pkg.cloudflare.com/index.html',
      restart: 'atc restart',
      ...cloudflared,
    },
  },
  'remote.addresses': { addresses: [] },
})

it('shows how to install cloudflared on the server, then to restart, instead of Start', async () => {
  const { workspace } = workspaceFixture(missing({ commands: ['sudo dnf install cloudflared'] }))
  render(<RemoteAccess workspace={workspace} />)
  await waitFor(() =>
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('cloudflared is not installed')
  )
  expect(screen.getByText('sudo dnf install cloudflared')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Copy install commands' })).toBeInTheDocument()
  expect(screen.getByText('atc restart')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Start remote access' })).not.toBeInTheDocument()
  expect(screen.queryByText('cloudflared unavailable')).not.toBeInTheDocument()
})

it('links the downloads when no command fits the server system', async () => {
  const { workspace } = workspaceFixture(
    missing({ commands: [], url: 'https://github.com/cloudflare/cloudflared/releases/latest' })
  )
  render(<RemoteAccess workspace={workspace} />)
  const link = await screen.findByRole('link', {
    name: 'https://github.com/cloudflare/cloudflared/releases/latest',
  })
  expect(link).toHaveAttribute('target', '_blank')
  expect(screen.queryByRole('button', { name: 'Copy install commands' })).not.toBeInTheDocument()
})

it('keeps Start when the server found cloudflared and it would not start', async () => {
  const { workspace } = workspaceFixture(missing({ commands: [], found: '/usr/bin/cloudflared' }))
  render(<RemoteAccess workspace={workspace} />)
  await screen.findByText(/\/usr\/bin\/cloudflared did not start/)
  expect(screen.getByRole('button', { name: 'Start remote access' })).toBeInTheDocument()
  expect(screen.queryByText('atc restart')).not.toBeInTheDocument()
})
