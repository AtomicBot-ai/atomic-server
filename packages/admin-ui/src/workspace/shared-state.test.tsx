import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { createServiceHub } from '@/services'
import type { EventSourceFactory } from '@/services/events'
import { FakeEventSource } from '@/test/fake-event-source'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { WorkspaceApp } from './WorkspaceApp'
import { workspaceApi } from './workspace-api'
import { CloudProviders } from './library/CloudProviders'
import { ServerConfiguration } from './server/ServerConfiguration'

beforeEach(() => {
  initializeServiceHubStore(
    createServiceHub({ eventSource: FakeEventSource as unknown as EventSourceFactory })
  )
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('keeps an explicitly opened Guide me visible after completed setup refreshes', async () => {
  vi.spyOn(workspaceApi, 'snapshot').mockResolvedValue(snapshotFixture())
  vi.spyOn(workspaceApi, 'operations').mockResolvedValue([...WORKSPACE_OPERATIONS])
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue({} as never)
  render(<WorkspaceApp />)
  fireEvent.click(await screen.findByRole('button', { name: 'Guide me' }))
  expect(await screen.findByRole('heading', { name: 'What would you like to connect?' })).toBeInTheDocument()
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'))
  })
  expect(screen.getByRole('heading', { name: 'What would you like to connect?' })).toBeInTheDocument()
})

it('closes an open web onboarding when the terminal completes setup and keeps an explicitly reopened guide', async () => {
  let snapshot = snapshotFixture({ setup: null, setups: [{ id: 'pending', stage: 'paused' }] })
  vi.spyOn(workspaceApi, 'snapshot').mockImplementation(async () => snapshot)
  vi.spyOn(workspaceApi, 'operations').mockResolvedValue([...WORKSPACE_OPERATIONS])
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue({} as never)
  render(<WorkspaceApp />)
  expect(await screen.findByRole('dialog', { name: 'Set up Atomic Server' })).toBeInTheDocument()
  snapshot = { ...snapshot, setup: { mode: 'manual', complete: true, updated_at: 2 } }
  fireEvent(document, new Event('visibilitychange'))
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Set up Atomic Server' })).not.toBeInTheDocument()
  )
  fireEvent.keyDown(window, { key: 'F1' })
  fireEvent.click(screen.getByRole('button', { name: 'Setup guide' }))
  fireEvent(document, new Event('visibilitychange'))
  expect(await screen.findByRole('dialog', { name: 'Set up Atomic Server' })).toBeInTheDocument()
})

it('updates start/stop status from the other client without resetting the current page or search', async () => {
  let snapshot = snapshotFixture({ api: { ...snapshotFixture().api, running: false } })
  vi.spyOn(workspaceApi, 'snapshot').mockImplementation(async () => snapshot)
  vi.spyOn(workspaceApi, 'operations').mockResolvedValue([...WORKSPACE_OPERATIONS])
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue({} as never)
  render(<WorkspaceApp />)
  const search = await screen.findByRole('textbox', { name: 'Search agents' })
  fireEvent.change(search, { target: { value: 'Claude' } })
  expect(screen.getByRole('button', { name: 'Start server' })).toBeInTheDocument()
  snapshot = { ...snapshot, api: { ...snapshot.api, running: true } }
  fireEvent(document, new Event('visibilitychange'))
  expect(await screen.findByRole('button', { name: 'Stop server' })).toBeInTheDocument()
  expect(search).toHaveValue('Claude')
  snapshot = { ...snapshot, api: { ...snapshot.api, running: false } }
  fireEvent(document, new Event('visibilitychange'))
  expect(await screen.findByRole('button', { name: 'Start server' })).toBeInTheDocument()
  expect(search).toHaveValue('Claude')
})

it('refreshes configured providers without closing or resetting the current provider editor', async () => {
  let providers: unknown[] = []
  const { workspace } = workspaceFixture({ 'cloud.list': () => ({ providers }) })
  render(<CloudProviders workspace={workspace} />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'OpenAI', exact: true }))
  const key = screen.getByLabelText('API key')
  fireEvent.change(key, { target: { value: 'unsaved-local-key' } })
  providers = [{ provider: 'anthropic', connected: true, models: [] }]
  fireEvent(document, new Event('visibilitychange'))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Anthropic', exact: true })).toHaveTextContent('Connected')
  )
  expect(key).toHaveValue('unsaved-local-key')
})

it('refreshes untouched server fields while preserving a local unsaved field', async () => {
  let api = { host: '127.0.0.1', port: 1337, prefix: '/v1', autoStart: false }
  const { workspace } = workspaceFixture({ 'config.get': () => ({ values: { api } }) })
  render(<ServerConfiguration workspace={workspace} />)
  const port = await screen.findByLabelText('Port')
  fireEvent.change(port, { target: { value: '3001' } })
  api = { ...api, prefix: '/v2', autoStart: true }
  // The existing watcher also refreshes as soon as the browser is shown again.
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'))
  })
  expect(screen.getByLabelText('API prefix')).toHaveValue('/v2')
  expect(port).toHaveValue(3001)
  expect(screen.getByRole('switch')).toBeChecked()
})
