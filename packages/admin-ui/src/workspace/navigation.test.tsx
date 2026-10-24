import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIBRARY_SECTIONS, PLAYGROUND_TASKS, SERVER_SECTIONS, WORKSPACE_OPERATIONS } from '@contract'
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
    await userEvent.keyboard('{Enter}')
    const main = within(screen.getByRole('navigation', { name: 'Main' }))
    expect(main.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Server',
      'Playground',
      'Models',
      'Help',
      'Settings',
    ])
    expect(
      within(screen.getByRole('navigation', { name: 'Server sections' }))
        .getAllByRole('button')
        .map((button) => button.textContent)
    ).toEqual(
      SERVER_SECTIONS.filter((item) =>
        ['overview', 'configuration', 'remote', 'proxy'].includes(item.id)
      ).map((item) => item.label)
    )
    expect(screen.getByRole('region', { name: 'Server control panel' })).toBeInTheDocument()
    expect(main.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    await userEvent.click(main.getByRole('button', { name: 'Playground' }))
    expect(
      within(screen.getByRole('navigation', { name: 'Playground tasks' }))
        .getAllByRole('button')
        .map((option) => option.textContent)
    ).toEqual(PLAYGROUND_TASKS.map((item) => (item.id === 'chat' ? 'New chat' : item.label)))
    await waitFor(() => expect(api).toHaveBeenCalledWith('history.list'))
  })

  it('opens the library on Local models and uses the canonical library order', async () => {
    render(<Catalog workspace={current} openCommand={vi.fn()} />)
    const nav = within(screen.getByRole('navigation', { name: 'Catalog sections' }))
    expect(nav.getAllByRole('button').map((button) => button.textContent)).toEqual(
      LIBRARY_SECTIONS.map((item) => item.label)
    )
    expect(nav.getByRole('button', { name: 'Local models' })).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(current.execute).toHaveBeenCalledWith('models.catalog', { category: 'text' }))
  })

  it.each([
    ['fresh profile', null, true],
    ['finished setup', { mode: 'guided', complete: true, updated_at: 1 }, false],
    ['manual setup', { mode: 'manual', complete: false, updated_at: 1 }, false],
  ] as const)('shows setup only for a %s without a saved choice', async (_name, setup, opens) => {
    const execute = vi
      .fn()
      .mockImplementation(async (operation: string) =>
        operation === 'engines.list'
          ? { engines: [{ engine: 'llamacpp-upstream', active: { version: 'b1' } }] }
          : []
      )
    current = workspace(fixture({ setup }), execute)
    render(<WorkspaceApp />)
    if (opens) await userEvent.click(await screen.findByRole('button', { name: 'Press any key' }))
    await screen.findByRole('navigation', { name: 'Main' })
    if (opens) {
      const dialog = within(screen.getByRole('dialog', { name: 'Set up Atomic Server' }))
      await waitFor(() => expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'text' }))
      expect(execute).toHaveBeenCalledWith('engines.list')
      expect(dialog.getByRole('button', { name: 'Skip setup' })).toBeInTheDocument()
    } else expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('connection and download lifecycle', () => {
  it('prepares the Codex handoff for the selected running model and key', async () => {
    const execute = vi
      .fn()
      .mockImplementation(async (name: string) =>
        name === 'models.installed'
          ? [{ id: 'chat-model', providers: ['llamacpp-upstream'] }]
          : name === 'keys.list'
            ? [{ id: 'desktop-key' }]
            : { launch_command: 'atc connect codex --model chat-model' }
      )
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
    render(
      <Server
        section="overview"
        showGuide
        initialAgent="codex"
        workspace={workspace(snapshot, execute)}
        openCommand={vi.fn()}
        openSetup={vi.fn()}
      />
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('connection.profile', {
        agent: 'codex',
        model: 'chat-model',
        key_id: 'desktop-key',
      })
    )
    expect(await screen.findByRole('button', { name: 'Copy launch command' })).toBeInTheDocument()
  })

  it('keeps a finished model in Downloads while removing its compact progress card and stale transfer', () => {
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
    expect(screen.getByText('chat-model')).toBeInTheDocument()
    expect(screen.getByText('Downloaded')).toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100')
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete model chat-model' })).toBeInTheDocument()
    rerender(
      <Downloads
        compact
        workspace={workspace(
          fixture({
            setups: [{ ...job, stage: 'ready' }],
            downloads: [{ taskId: 'weights', transferred: 100, total: 100 }],
          })
        )}
      />
    )
    expect(screen.queryByRole('region', { name: 'Downloads' })).not.toBeInTheDocument()
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
    render(<Catalog section="installed" workspace={workspace(fixture(), execute)} openCommand={vi.fn()} />)
    expect(await screen.findByText('Image model')).toBeInTheDocument()
    expect(screen.queryByText('Pending image')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith('artifacts.load', { id: 'image-ready' }))
  })
})
