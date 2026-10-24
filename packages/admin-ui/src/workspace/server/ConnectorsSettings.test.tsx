import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ConnectorsSettings } from './ConnectorsSettings'
it('shows desktop catalog and requires a secret before saving and checking a connector', async () => {
  const { workspace, execute } = workspaceFixture({ 'connectors.save': {}, 'connectors.check': {} })
  render(<ConnectorsSettings workspace={workspace} />)
  expect(screen.getByRole('heading', { name: 'Exa' })).toBeInTheDocument()
  const card = screen.getByRole('heading', { name: 'Firecrawl' }).closest('article')!
  await userEvent.click(within(card).getByRole('button', { name: 'Set Up' }))
  const dialog = screen.getByRole('dialog', { name: 'Connect Firecrawl' })
  expect(within(dialog).getByRole('button', { name: 'Connect' })).toBeDisabled()
  await userEvent.type(within(dialog).getByLabelText('Firecrawl API key'), 'fc-testing')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Connect' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('connectors.check', { id: 'firecrawl' }))
  expect(execute).toHaveBeenCalledWith('connectors.save', {
    value: expect.objectContaining({
      headers: { Authorization: 'Bearer fc-testing' },
      url: 'https://mcp.firecrawl.dev/v2/mcp',
    }),
  })
})
it('keeps invalid JSON open and reports the problem without mutating configurations', async () => {
  const { workspace, execute } = workspaceFixture({})
  render(<ConnectorsSettings workspace={workspace} />)
  await userEvent.click(screen.getByRole('button', { name: 'Import Config' }))
  const dialog = screen.getByRole('dialog', { name: 'Edit MCP configuration' })
  fireEvent.change(within(dialog).getByLabelText('Configuration (JSON)'), {
    target: { value: '{"mcpServers":[]}' },
  })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('mcpServers must be an object')
  expect(execute).not.toHaveBeenCalledWith('connectors.import', expect.anything())
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('cancels an in-progress browser sign-in on Escape and never claims connected', async () => {
  const { workspace, execute } = workspaceFixture({
    'connectors.save': {},
    'connectors.oauth.start': { url: 'https://example.com/oauth' },
    'connectors.oauth.cancel': {},
  })
  render(<ConnectorsSettings workspace={workspace} />)
  await userEvent.click(
    within(screen.getByRole('heading', { name: 'Linear' }).closest('article')!).getByRole('button', {
      name: 'Sign in',
    })
  )
  expect(await screen.findByRole('dialog', { name: 'Sign in to Linear' })).toHaveTextContent(
    'Waiting for sign-in'
  )
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(execute).toHaveBeenCalledWith('connectors.oauth.cancel', { id: 'linear' }))
  expect(execute).not.toHaveBeenCalledWith('connectors.check', expect.anything())
})
it('dismisses connector actions on Escape, outside click and action selection', async () => {
  const { workspace } = workspaceFixture({})
  const { MCP_CONNECTORS } = await import('@contract'),
    { connectorDraft } = await import('@view')
  workspace.snapshot!.features = {
    assistants: [],
    default_assistant: '',
    skills: [],
    connectors: [connectorDraft(MCP_CONNECTORS[0]!)],
    connector_status: {},
    attachments: {} as never,
  }
  render(<ConnectorsSettings workspace={workspace} />)
  const summary = screen.getByLabelText('Exa actions'),
    menu = summary.closest('details')!
  await userEvent.click(summary)
  expect(menu.open).toBe(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(menu.open).toBe(false)
  await userEvent.click(summary)
  fireEvent.click(document.body)
  expect(menu.open).toBe(false)
  await userEvent.click(summary)
  await userEvent.click(within(menu).getByRole('button', { name: 'Tools (0)' }))
  expect(menu.open).toBe(false)
  expect(screen.getByRole('dialog', { name: 'Exa tools' })).toBeInTheDocument()
})

it('keeps failed OAuth setup retryable with an optional registered client ID', async () => {
  const { workspace, execute } = workspaceFixture({
    'connectors.save': {},
    'connectors.oauth.start': (input: Record<string, unknown>) => {
      if (!input.client_id) throw new Error('This server requires a registered OAuth client ID.')
      return { url: 'https://example.com/oauth' }
    },
    'connectors.oauth.cancel': {},
  })
  render(<ConnectorsSettings workspace={workspace} />)
  await userEvent.click(
    within(screen.getByRole('heading', { name: 'Linear' }).closest('article')!).getByRole('button', {
      name: 'Sign in',
    })
  )
  const dialog = await screen.findByRole('dialog', { name: 'Sign in to Linear' })
  expect(within(dialog).getByRole('alert')).toHaveTextContent('registered OAuth client ID')
  await userEvent.type(within(dialog).getByLabelText('OAuth client ID (optional)'), 'registered-client')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Retry sign-in' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('connectors.oauth.start', {
      id: 'linear',
      client_id: 'registered-client',
    })
  )
  expect(within(dialog).getByRole('link', { name: 'Open sign-in' })).toHaveAttribute(
    'href',
    'https://example.com/oauth'
  )
  expect(execute).not.toHaveBeenCalledWith('connectors.check', expect.anything())
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
})
