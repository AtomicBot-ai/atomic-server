/** Cases from the October 2026 bug hunt over the web admin: each one failed before its fix. */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { workspaceApi } from './workspace-api'
import { useWorkspace } from './useWorkspace'
import { Chat } from './chat/Chat'
import { ChatAttachments } from './chat/ChatAttachments'
import { OperationForm } from './OperationForm'
import { SetupWizard } from './setup/SetupWizard'
import { Server } from './server/Server'
import { useState } from 'react'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

it('loads the operations on a later refresh when the first read failed', async () => {
  vi.spyOn(workspaceApi, 'snapshot').mockResolvedValue(snapshotFixture())
  const operations = vi
    .spyOn(workspaceApi, 'operations')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue([...WORKSPACE_OPERATIONS])
  const view = renderHook(() => useWorkspace())
  await waitFor(() => expect(operations).toHaveBeenCalled())
  await act(async () => {
    await view.result.current.refresh()
  })
  await waitFor(() => expect(view.result.current.operations.length).toBeGreaterThan(0))
})

it('empties the composer once the request is accepted, not when the answer ends', async () => {
  localStorage.setItem('atomic:playground:preferences:v1', JSON.stringify({ sidebar: true }))
  let progress = 0
  vi.spyOn(workspaceApi, 'execute').mockImplementation(async (name) => {
    if (name === 'chat.start' || name === 'chat.progress') {
      progress += 1
      return {
        id: 'job',
        conversation_id: 'c1',
        state: 'generating',
        message: { role: 'assistant', content: 'thinking'.slice(0, progress) },
        started_at: 1,
        duration_ms: 1,
      } as never
    }
    const stored = {
      id: 'c1',
      title: 'Earlier chat',
      messages: [{ role: 'user', content: 'first' }],
      request_settings: {},
      updatedAt: 1,
    }
    if (name === 'history.load') return stored as never
    if (name === 'history.list') return [stored] as never
    return [] as never
  })
  const { workspace } = workspaceFixture(
    {},
    {
      services: [
        { id: 'chat', provider: 'llamacpp-upstream', model: 'm', kind: 'chat', state: 'ready', details: {} },
      ],
    }
  )
  render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Earlier chat' }))
  await waitFor(() => expect(workspaceApi.execute).toHaveBeenCalledWith('history.load', { id: 'c1' }))
  const draft = screen.getByRole('textbox', { name: 'Message' })
  fireEvent.change(draft, { target: { value: 'Second question' } })
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(workspaceApi.execute).toHaveBeenCalledWith('chat.start', expect.anything()))
  await waitFor(() => expect(draft).toHaveValue(''))
})

it('tells a text-only model’s user that images need a vision model instead of parsing the PNG', async () => {
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue({
    attachments: { enabled: true, max_file_size_mb: 10 },
  } as never)
  const setAttachments = vi.fn()
  render(<ChatAttachments attachments={[]} setAttachments={setAttachments} disabled={false} vision={false} />)
  // Dropped or pasted, an image reaches the input whatever `accept` says.
  await userEvent.upload(
    screen.getByLabelText('Choose attachments'),
    new File(['png'], 'shot.png', { type: 'image/png' }),
    { applyAccept: false }
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(/vision/i)
  expect(workspaceApi.execute).not.toHaveBeenCalledWith('attachments.parse', expect.anything())
  expect(setAttachments).not.toHaveBeenCalled()
})

it('shows an id that merely names a key as text, not as a password', () => {
  const { workspace } = workspaceFixture({})
  const operation = WORKSPACE_OPERATIONS.find((item) => item.name === 'connection.profile')!
  render(<OperationForm operation={operation} execute={workspace.execute} />)
  expect(screen.getByLabelText(/key id/)).toHaveAttribute('type', 'text')
})

it('keeps the server on the network the person chose when an agent connection is configured', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      'models.installed': [{ id: 'local-model', name: 'Local model', providers: ['llamacpp-upstream'] }],
      'models.catalog': [],
      'keys.list': [{ id: 'key' }],
      'connection.info': { endpoint: 'http://192.168.1.5:1337/v1' },
      'connection.profile': { launch_command: 'atc connect codex --model local-model' },
    },
    {
      setup: null,
      api: {
        running: true,
        endpoint: 'http://0.0.0.0:1337/v1',
        host: '0.0.0.0',
        port: 1337,
        prefix: '/v1',
        raw: {},
      },
    }
  )
  function Handoff() {
    const [setup, setSetup] = useState(true)
    return setup ? (
      <SetupWizard
        workspace={workspace}
        onClose={vi.fn()}
        onOpenGoal={vi.fn()}
        onDestination={() => setSetup(false)}
      />
    ) : (
      <Server section="overview" workspace={workspace} openCommand={vi.fn()} openSetup={vi.fn()} />
    )
  }
  render(<Handoff />)
  await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: /Connect an agent/ }))
  await userEvent.click(
    within(screen.getByRole('heading', { name: 'Codex CLI' }).closest('article')!).getByRole('button', {
      name: 'Configure',
    })
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Configure & start' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('api.restart', expect.anything()))
  const config = execute.mock.calls.find(([name]) => name === 'config.update')?.[1] as {
    values: Record<string, unknown>
  }
  expect(config.values).not.toHaveProperty('api.host')
  expect(execute).toHaveBeenCalledWith('api.restart', { request: { host: '0.0.0.0', port: 1337 } })
})
