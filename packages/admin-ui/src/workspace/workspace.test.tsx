import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import type { WorkspaceSnapshot } from '@contract'
import { OperationForm } from './OperationForm'
import { Server } from './server/Server'
import { SetupWizard } from './setup/SetupWizard'
import { ModelInstall } from './library/ModelInstall'
import { Chat } from './chat/Chat'
import { workspaceApi } from './workspace-api'
import type { Workspace } from './useWorkspace'
import type { Execute } from './types'

const snapshot: WorkspaceSnapshot = {
  version: 1,
  captured_at: 1,
  core: { version: '0.13.6', instance_id: 'test', uptime_ms: 30 },
  api: {
    running: true,
    endpoint: 'http://127.0.0.1:1337/v1',
    host: '127.0.0.1',
    port: 1337,
    prefix: '/v1',
    raw: {},
  },
  eye: 'ready',
  services: [
    {
      id: 'session',
      provider: 'llamacpp-upstream',
      model: 'chat-model',
      kind: 'chat',
      state: 'ready',
      details: {},
    },
  ],
  downloads: [],
  setups: [],
  setup: { mode: 'guided', complete: true, updated_at: 1 },
  keys: [{ id: 'key-1', name: 'Desktop', preview: 'atc_…1234', createdAt: 1 }],
  metrics: {
    window_ms: 300000,
    requests: 0,
    errors: 0,
    active: null,
    mean_latency_ms: null,
    mean_ttft_ms: null,
    tokens_per_second: null,
    since: 1,
  },
  requests: [],
  errors: [],
}
function workspace(execute: ReturnType<typeof vi.fn>): Workspace {
  return {
    snapshot,
    operations: [...WORKSPACE_OPERATIONS],
    execute: execute as Execute,
    loading: false,
    error: '',
    pending: [],
    refresh: vi.fn(),
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('real workspace controls', () => {
  it('sends operations through authenticated BFF requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await workspaceApi.execute('api.start', { request: { port: 1337 } })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/workspace/execute',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ 'x-atc-admin': '1' }),
        body: JSON.stringify({ operation: 'api.start', input: { request: { port: 1337 } } }),
      })
    )
  })
  it('keeps initial selections and sends selected model fields', async () => {
    const execute = vi.fn().mockResolvedValue({ loaded: true })
    render(
      <OperationForm
        operation={WORKSPACE_OPERATIONS.find((op) => op.name === 'models.load')!}
        execute={execute as Execute}
        initial={{ provider: 'mlx', model_id: 'my-model' }}
      />
    )
    expect(screen.getByLabelText('provider *')).toHaveValue('mlx')
    expect(screen.getByLabelText('model id *')).toHaveValue('my-model')
    await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('models.load', { provider: 'mlx', model_id: 'my-model' })
    )
  })
  it('copies exact endpoint and only requests a secret when Copy API key is pressed', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const execute = vi.fn().mockResolvedValue({ key: 'test-only-client-key' })
    render(<Server workspace={workspace(execute)} openCommand={vi.fn()} openSetup={vi.fn()} />)
    expect(execute).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Copy address' }))
    expect(write).toHaveBeenCalledWith('http://127.0.0.1:1337/v1')
    await user.click(screen.getByRole('button', { name: 'Copy API key' }))
    await waitFor(() => expect(write).toHaveBeenCalledWith('test-only-client-key'))
    expect(execute).toHaveBeenCalledWith('keys.reveal', { id: 'key-1' })
    expect(screen.queryByText('test-only-client-key')).not.toBeInTheDocument()
  })
  it('can leave first-run setup without any downloads or model loads', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ id: 'AtomicChat/model', name: 'Model' }] })
    const close = vi.fn()
    render(<SetupWizard workspace={workspace(execute)} onClose={close} onOpenGoal={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Explore without installing' }))
    await waitFor(() => expect(close).toHaveBeenCalled())
    expect(execute).toHaveBeenCalledWith('setup.manual')
    expect(
      execute.mock.calls.some(([name]) => String(name).includes('install') || String(name).includes('load'))
    ).toBe(false)
  })
  it('downloads only after the user reviews the exact plan', async () => {
    const execute = vi.fn().mockImplementation(async (name: string) =>
      name === 'models.files'
        ? [{ filename: 'model.gguf', size: 1024 }]
        : name === 'models.plan'
          ? {
              digest: 'approved-digest',
              blockers: [],
              total_download_bytes: 1024,
              provider: 'llamacpp-upstream',
            }
          : { id: 'setup-1' }
    )
    const started = vi.fn()
    render(
      <ModelInstall
        model={{ id: 'AtomicChat/model', name: 'Model' }}
        category="text"
        execute={execute as Execute}
        onClose={vi.fn()}
        onStarted={started}
      />
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review download' })).toBeEnabled())
    expect(execute).not.toHaveBeenCalledWith('models.install', expect.anything())
    await userEvent.click(screen.getByRole('button', { name: 'Review download' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('models.install', {
        request: { repo: 'AtomicChat/model', file: 'model.gguf', include_projector: true },
        plan_digest: 'approved-digest',
        request_id: expect.any(String),
      })
    )
    expect(started).toHaveBeenCalled()
  })
  it('keeps a reopened chat in its position and Shift+Enter never sends', async () => {
    const reply = { role: 'assistant', content: 'New reply' }
    const conversation = {
      id: 'first',
      model: 'chat-model',
      messages: [
        { role: 'user', content: 'Earlier message' },
        { role: 'assistant', content: 'Earlier reply' },
      ] as unknown[],
    }
    const job = { id: 'job-1', conversation_id: 'first', model: 'chat-model', message: reply }
    // Chat streams through server-owned jobs: chat.start, then chat.progress polling.
    const execute = vi.spyOn(workspaceApi, 'execute').mockImplementation((async (
      name: string,
      input: { request?: { messages?: unknown[] } } = {}
    ) => {
      if (name === 'history.list')
        return [
          { id: 'second', title: 'Latest' },
          { id: 'first', title: 'Earlier' },
        ]
      if (name === 'history.load') return conversation
      if (name === 'chat.start') {
        conversation.messages = [...(input.request?.messages ?? []), reply]
        return { ...job, state: 'preparing', message: {} }
      }
      if (name === 'chat.progress') return { ...job, state: 'complete' }
      return {}
    }) as typeof workspaceApi.execute)
    render(<Chat workspace={workspace(vi.fn())} onCatalog={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Earlier' }))
    await screen.findByText('Earlier reply')
    const input = screen.getByLabelText('Message')
    fireEvent.change(input, { target: { value: 'Next question' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(execute).not.toHaveBeenCalledWith('chat.start', expect.anything())
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByText('New reply')
    expect(execute).toHaveBeenCalledWith(
      'chat.start',
      expect.objectContaining({
        conversation_id: 'first',
        provider: 'llamacpp-upstream',
        request: expect.objectContaining({ model: 'chat-model' }),
      })
    )
    expect(
      within(screen.getByRole('complementary'))
        .getAllByRole('button')
        .filter((button) => ['Latest', 'Earlier'].includes(button.textContent ?? ''))
        .map((button) => button.textContent)
    ).toEqual(['Latest', 'Earlier'])
  })
})
