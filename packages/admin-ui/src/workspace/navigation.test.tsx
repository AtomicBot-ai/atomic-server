import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LIBRARY_SECTIONS,
  PLAYGROUND_TASKS,
  SERVER_SECTIONS,
  WORKSPACE_NAVIGATION,
  WORKSPACE_OPERATIONS,
} from '@contract'
import type { WorkspaceSnapshot } from '@contract'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { createServiceHub } from '@/services'
import type { EventSourceFactory } from '@/services/events'
import { FakeEventSource } from '@/test/fake-event-source'
import { WorkspaceApp } from './WorkspaceApp'
import { Catalog } from './library/Catalog'
import { Server } from './server/Server'
import { Downloads } from './library/Downloads'
import type { Workspace } from './useWorkspace'
import type { Execute } from './types'
import { workspaceApi } from './workspace-api'

let current: Workspace
vi.mock('./useWorkspace', () => ({ useWorkspace: () => current }))

function fixture(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
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
    services: [],
    downloads: [],
    setups: [],
    setup: { mode: 'guided', complete: true, updated_at: 1 },
    keys: [],
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
    ...overrides,
  }
}
function workspace(snapshot = fixture(), execute = vi.fn().mockResolvedValue([])): Workspace {
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

beforeEach(() => {
  initializeServiceHubStore(
    createServiceHub({ eventSource: FakeEventSource as unknown as EventSourceFactory })
  )
  current = workspace()
})
afterEach(() => vi.restoreAllMocks())

describe('shared workspace structure', () => {
  it('uses the canonical page, server section, and playground task order', async () => {
    // The Playground chat session talks to the operation boundary directly, so its
    // 250 ms progress polling does not trigger a workspace snapshot refresh each time.
    const api = vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
    render(<WorkspaceApp />)
    const main = within(screen.getByRole('navigation', { name: 'Main' }))
    expect(main.getAllByRole('button').map((button) => button.textContent)).toEqual(
      WORKSPACE_NAVIGATION.map((item) => item.label)
    )
    expect(
      within(screen.getByRole('navigation', { name: 'Server sections' }))
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(SERVER_SECTIONS.map((item) => item.label))
    expect(main.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument()
    await userEvent.click(main.getByRole('button', { name: 'Playground' }))
    expect(
      within(screen.getByLabelText('Task'))
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(PLAYGROUND_TASKS.map((item) => item.label))
    await waitFor(() => expect(api).toHaveBeenCalledWith('history.list'))
  })

  it('opens the library on Installed and uses the canonical library order', async () => {
    render(<Catalog workspace={current} openCommand={vi.fn()} />)
    const nav = within(screen.getByRole('navigation', { name: 'Catalog sections' }))
    expect(nav.getAllByRole('button').map((button) => button.textContent)).toEqual(
      LIBRARY_SECTIONS.map((item) => item.label)
    )
    expect(nav.getByRole('button', { name: 'Installed' })).toHaveAttribute('aria-current', 'page')
    await screen.findByText('No models installed. Find a model or import a local file.')
    expect(current.execute).toHaveBeenCalledWith('models.installed')
    expect(current.execute).not.toHaveBeenCalledWith('models.catalog', expect.anything())
  })

  it.each([
    ['fresh profile', null, true],
    ['finished setup', { mode: 'guided', complete: true, updated_at: 1 }, false],
    ['manual setup', { mode: 'manual', complete: false, updated_at: 1 }, false],
  ] as const)('shows setup only for a %s without a saved choice', async (_name, setup, opens) => {
    const execute = vi
      .fn()
      .mockImplementation(async (operation: string) =>
        operation === 'engines.list' ? [{ engine: 'llamacpp-upstream', active: { version: 'b1' } }] : []
      )
    current = workspace(fixture({ setup }), execute)
    render(<WorkspaceApp />)
    if (opens) {
      const dialog = within(screen.getByRole('dialog', { name: 'Set up Atomic Server' }))
      // Engine first: the model catalog is not requested until an engine is chosen.
      await waitFor(() => expect(execute).toHaveBeenCalledWith('engines.list'))
      await userEvent.selectOptions(
        await dialog.findByRole('combobox', { name: 'Setup engine' }),
        await dialog.findByRole('option', { name: /llama\.cpp/ })
      )
      expect(execute).not.toHaveBeenCalledWith('models.catalog', expect.anything())
      await userEvent.click(dialog.getByRole('button', { name: 'Choose models for this engine' }))
      await waitFor(() => expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'text' }))
      await waitFor(() => expect(dialog.queryByText('Loading models…')).not.toBeInTheDocument())
    } else expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('connection and download lifecycle', () => {
  it('prepares the Codex handoff for the selected running model and key', async () => {
    const execute = vi.fn().mockResolvedValue({ launch_command: 'atc connect codex --model chat-model' })
    const snapshot = fixture({
      services: [
        {
          id: 'chat',
          provider: 'llamacpp-upstream',
          model: 'chat-model',
          kind: 'chat',
          state: 'ready',
          details: {},
        },
      ],
      keys: [{ id: 'desktop-key', name: 'Desktop', preview: 'atc_…1234', createdAt: 1 }],
    })
    render(<Server workspace={workspace(snapshot, execute)} openCommand={vi.fn()} openSetup={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText('Agent'), 'codex')
    await userEvent.click(screen.getByRole('button', { name: 'Connect agent' }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('connection.profile', {
        agent: 'codex',
        model: 'chat-model',
        key_id: 'desktop-key',
      })
    )
    expect(await screen.findByRole('button', { name: 'Copy launch command' })).toBeInTheDocument()
  })

  it('removes a finished download when its snapshot updates, including a stale transfer', () => {
    const job = {
      setup_id: 'chat-job',
      stage: 'downloading_model',
      task_ids: { model: 'weights' },
      plan: { model_id: 'chat-model', total_download_bytes: 100 },
    }
    const { rerender } = render(
      <Downloads
        workspace={workspace(
          fixture({
            setups: [job],
            downloads: [{ taskId: 'weights', transferred: 50, total: 100 }],
          })
        )}
      />
    )
    expect(screen.getByText('chat-model')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    rerender(
      <Downloads
        workspace={workspace(
          fixture({
            setups: [{ ...job, stage: 'ready' }],
            downloads: [{ taskId: 'weights', transferred: 100, total: 100 }],
          })
        )}
      />
    )
    expect(screen.queryByText('chat-model')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText('No downloads in progress.')).toBeInTheDocument()
  })

  it('keeps completed artifacts loadable under Installed without unfinished jobs', async () => {
    const execute = vi.fn().mockImplementation(async (operation: string) =>
      operation === 'artifacts.list'
        ? [
            { id: 'image-ready', stage: 'ready', plan: { name: 'Image model', category: 'image' } },
            { id: 'image-pending', stage: 'downloading', plan: { name: 'Pending image', category: 'image' } },
          ]
        : []
    )
    render(<Catalog workspace={workspace(fixture(), execute)} openCommand={vi.fn()} />)
    expect(await screen.findByText('Image model')).toBeInTheDocument()
    expect(screen.queryByText('Pending image')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith('artifacts.load', { id: 'image-ready' }))
  })
})
