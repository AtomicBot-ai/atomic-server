import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { FoundryLocal } from './FoundryLocal'
import { LiteRtLm } from './LiteRtLm'

const cases = [
  { engine: 'foundry-local', prefix: 'foundry', name: 'Foundry Local', Panel: FoundryLocal },
  { engine: 'litert-lm', prefix: 'litert', name: 'LiteRT-LM', Panel: LiteRtLm },
]
const view = (installed = false) => ({
  installed,
  build: installed ? 'v1/win-x64' : null,
  accelerators: [],
  npu: null,
  preparing: false,
  error: null,
  last_result: null,
  last_error: null,
  steps: [],
})

describe.each(cases)('$name installation in web', ({ engine, prefix, name, Panel }) => {
  it('keeps installation progress across reopening, ignores other transfers and prevents a second install', async () => {
    let finish!: () => void
    let current = view()
    const { workspace, execute } = workspaceFixture({
      [`${prefix}.accelerators`]: () => current,
      'engines.install': () =>
        new Promise<void>((resolve) => {
          finish = () => {
            current = view(true)
            resolve()
          }
        }),
    })
    let ui = render(<Panel workspace={workspace} onClose={() => {}} />)
    await userEvent.dblClick(await screen.findByRole('button', { name: `Install ${name}` }))
    expect(await screen.findByRole('button', { name: 'Installing engine…' })).toBeDisabled()
    const calls = execute.mock.calls.filter(([op]) => op === 'engines.install')
    expect(calls).toHaveLength(1)
    const request = calls[0]?.[1]?.request as { task_id: string }
    expect(request.task_id).toEqual(expect.any(String))
    workspace.snapshot = snapshotFixture({
      downloads: [
        { taskId: 'other', total: 100, transferred: 99 },
        { taskId: request.task_id, total: 100, transferred: 25 },
      ],
    })
    ui.unmount()
    ui = render(<Panel workspace={{ ...workspace }} onClose={() => {}} />)
    expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '25')
    expect(screen.getByRole('button', { name: 'Installing engine…' })).toBeDisabled()
    await act(async () => finish())
    expect(await screen.findByRole('button', { name: 'Update build' })).toBeEnabled()
    expect(screen.queryByText('Installing engine…')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    ui.unmount()
  })

  it('shows preparation after the download and preserves a real preparation failure', async () => {
    let fail!: (error: Error) => void
    let current = view()
    const { workspace } = workspaceFixture({
      [`${prefix}.accelerators`]: () => ({
        ...current,
        accelerators: [{ name: 'openvino', device: 'npu', execution_provider: 'openvino', prepared: false }],
      }),
      'engines.install': () => {
        current = view(true)
      },
      [`${prefix}.prepare`]: () =>
        new Promise<void>((_, reject) => {
          fail = reject
        }),
    })
    render(<Panel workspace={workspace} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: `Install ${name}` }))
    expect(await screen.findByRole('button', { name: 'Preparing accelerators…' })).toBeDisabled()
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
    await act(async () => fail(new Error('Accelerator setup failed')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Accelerator setup failed')
    expect(await screen.findByRole('button', { name: 'Update build' })).toBeEnabled()
    expect(screen.queryByText('Preparing accelerators…')).toBeNull()
  })

  it('clears a previous local failure when a queued retry starts and succeeds', async () => {
    let current = view()
    const { workspace } = workspaceFixture({
      [`${prefix}.accelerators`]: () => current,
      'engines.install': () => {
        throw new Error('Previous download failed')
      },
    })
    const ui = render(<Panel workspace={workspace} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: `Install ${name}` }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Previous download failed')
    const job = { kind: 'engine', engine, id: 'retry', taskId: 'retry', stage: 'downloading' }
    workspace.snapshot = snapshotFixture({ downloads: [job] })
    ui.rerender(<Panel workspace={{ ...workspace }} onClose={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Downloading engine…' })).toBeDisabled()
    expect(screen.queryByRole('alert')).toBeNull()
    current = view(true)
    workspace.snapshot = snapshotFixture({ downloads: [{ ...job, stage: 'ready' }] })
    ui.rerender(<Panel workspace={{ ...workspace }} onClose={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Update build' })).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['ready', 'failed'])('joins a queued intro install and handles its %s outcome', async (stage) => {
    let current = view()
    const job = {
      kind: 'engine',
      engine,
      id: 'intro',
      taskId: 'intro',
      stage: 'downloading',
      total: 100,
      transferred: 40,
    }
    const { workspace, execute } = workspaceFixture(
      { [`${prefix}.accelerators`]: () => current },
      { downloads: [job] }
    )
    const ui = render(<Panel workspace={workspace} onClose={() => {}} />)
    const button = await screen.findByRole('button', { name: 'Downloading engine…' })
    expect(button).toBeDisabled()
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '40')
    await userEvent.click(button)
    expect(execute.mock.calls.filter(([op]) => op === 'engines.install')).toHaveLength(0)
    current = view(stage === 'ready')
    workspace.snapshot = snapshotFixture({ downloads: [{ ...job, stage, error: 'Download failed' }] })
    ui.rerender(<Panel workspace={{ ...workspace }} onClose={() => {}} />)
    if (stage === 'ready') expect(await screen.findByRole('button', { name: 'Update build' })).toBeEnabled()
    else expect(await screen.findByRole('alert')).toHaveTextContent('Download failed')
    await waitFor(() => expect(screen.queryByText('Installing engine…')).toBeNull())
  })
})
