import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { EngineOverview } from './EngineOverview'

it.each(['fastflowlm', 'llamacpp-upstream', 'mlx', 'audio-cpp'])(
  'keeps %s queued across reopening until the server reports completion',
  async (engine) => {
    let finish!: (value: unknown) => void
    let installed = false
    const job = { id: 'install', taskId: 'install', kind: 'engine', engine, stage: 'queued', updated_at: 1 }
    const { workspace, execute } = workspaceFixture({
      'engines.list': () => ({
        engines: [
          {
            engine,
            kind: 'engine-build',
            builds: [],
            active: installed ? { version: 'v2', variant: 'cpu' } : null,
          },
        ],
      }),
      'engines.enqueue': () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      'fastflowlm.probe': {
        status: 'blocked',
        blockers: ['engine-not-installed'],
        changes: [],
        packages: [],
      },
      'fastflowlm.operations': [],
      'fastflowlm.host-steps': [],
    })
    const props = { provider: engine, workspace, onClose: vi.fn() }
    let ui = render(<EngineOverview {...props} />)
    await userEvent.dblClick(await screen.findByRole('button', { name: 'Install engine' }))
    expect(execute.mock.calls.filter(([name]) => name === 'engines.enqueue')).toHaveLength(1)
    await act(async () => finish(job))
    expect(screen.getByRole('button', { name: /Queued/ })).toBeDisabled()
    expect(screen.queryByText('Not installed')).not.toBeInTheDocument()
    ui.unmount()
    ui = render(<EngineOverview {...props} />)
    expect(await screen.findByRole('button', { name: /Queued/ })).toBeDisabled()
    workspace.snapshot = snapshotFixture({
      downloads: [{ ...job, stage: 'extracting', total: 100, transferred: 100 }],
    })
    ui.rerender(<EngineOverview {...props} workspace={{ ...workspace }} />)
    expect(await screen.findByRole('button', { name: 'Unpacking engine…' })).toBeDisabled()
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
    installed = true
    workspace.snapshot = snapshotFixture({ downloads: [{ ...job, stage: 'ready', updated_at: 2 }] })
    ui.rerender(<EngineOverview {...props} workspace={{ ...workspace }} />)
    expect(await screen.findByText('Installed')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  }
)

it('restores an installation failure on reopening and offers a retry without contradicting the active build', async () => {
  const { workspace } = workspaceFixture(
    {
      'engines.list': {
        engines: [
          {
            engine: 'fastflowlm',
            kind: 'engine-build',
            active: { version: 'v1', variant: 'win-x64' },
            builds: [],
          },
        ],
      },
      'fastflowlm.probe': { status: 'ready', blockers: [], changes: [], packages: [] },
      'fastflowlm.operations': [],
      'fastflowlm.host-steps': [],
    },
    {
      downloads: [
        {
          id: 'failed',
          taskId: 'failed',
          kind: 'engine',
          engine: 'fastflowlm',
          stage: 'failed',
          error: 'Disk full',
          updated_at: 3,
        },
      ],
    }
  )
  render(<EngineOverview provider="fastflowlm" workspace={workspace} onClose={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
  expect(screen.getByRole('button', { name: 'Retry installation' })).toBeEnabled()
  expect(screen.getByText(/v1/)).toBeInTheDocument()
})

it('keeps a retry queued when the old snapshot still contains the same failed job', async () => {
  const failed = {
    id: 'same',
    taskId: 'same',
    kind: 'engine',
    engine: 'mlx',
    stage: 'failed',
    error: 'Offline',
    updated_at: 1,
  }
  const { workspace, execute } = workspaceFixture(
    {
      'engines.list': { engines: [{ engine: 'mlx', kind: 'engine-build', builds: [] }] },
      'engines.enqueue': { ...failed, stage: 'queued', error: null, updated_at: 2 },
    },
    { downloads: [failed] }
  )
  const props = { provider: 'mlx', workspace, onClose: vi.fn() }
  const ui = render(<EngineOverview {...props} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Retry installation' }))
  expect(await screen.findByRole('button', { name: 'Queued…' })).toBeDisabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  workspace.snapshot = snapshotFixture({ downloads: [{ ...failed }] })
  ui.rerender(<EngineOverview {...props} workspace={{ ...workspace }} />)
  expect(screen.getByRole('button', { name: 'Queued…' })).toBeDisabled()
  ui.unmount()
  render(<EngineOverview {...props} />)
  expect(await screen.findByRole('button', { name: 'Queued…' })).toBeDisabled()
  expect(execute.mock.calls.filter(([name]) => name === 'engines.enqueue')).toHaveLength(1)
})
