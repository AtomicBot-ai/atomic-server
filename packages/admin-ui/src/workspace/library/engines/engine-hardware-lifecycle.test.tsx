import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { EngineOverview } from './EngineOverview'

it.each([
  ['foundry-local', 'foundry'],
  ['litert-lm', 'litert'],
])('retries %s through its failed queue job', async (engine, prefix) => {
  const failed = {
    id: 'retry',
    taskId: 'retry',
    kind: 'engine',
    engine,
    stage: 'failed',
    error: 'Download failed',
    updated_at: 1,
  }
  let installed = false
  const { workspace, execute } = workspaceFixture(
    {
      'engines.list': () => ({
        engines: [{ engine, builds: [], active: installed ? { version: 'v1' } : null }],
      }),
      [`${prefix}.accelerators`]: () => ({ installed, accelerators: [], steps: [] }),
      'engines.enqueue': { ...failed, stage: 'queued', error: null, updated_at: 2 },
    },
    { downloads: [failed] }
  )
  const props = { provider: engine, workspace, onClose: vi.fn() }
  const ui = render(<EngineOverview {...props} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Retry installation' }))
  expect(execute).toHaveBeenCalledWith('engines.enqueue', { engine })
  expect(execute).not.toHaveBeenCalledWith('engines.install', expect.anything())
  installed = true
  workspace.snapshot = snapshotFixture({ downloads: [{ ...failed, stage: 'ready', updated_at: 3 }] })
  ui.rerender(<EngineOverview {...props} workspace={{ ...workspace }} />)
  expect(await screen.findByText('Installed')).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it.each([
  ['foundry-local', 'foundry'],
  ['litert-lm', 'litert'],
])('keeps %s hardware failures out of runtime installation', async (engine, prefix) => {
  let fail!: (error: Error) => void
  const { workspace } = workspaceFixture({
    'engines.list': { engines: [{ engine, builds: [], active: { version: 'v1' } }] },
    [`${prefix}.accelerators`]: {
      installed: true,
      accelerators: [{ name: 'openvino', device: 'npu', execution_provider: 'OpenVINO', prepared: false }],
      steps: [],
    },
    [`${prefix}.prepare`]: () =>
      new Promise((_, reject) => {
        fail = reject
      }),
  })
  render(<EngineOverview provider={engine} workspace={workspace} onClose={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: /^Prepare / }))
  const installation = within(screen.getByRole('region', { name: 'Engine builds' }))
  expect(installation.getByText('Installed')).toBeVisible()
  expect(installation.queryByText('Installation in progress')).not.toBeInTheDocument()
  await act(async () => fail(new Error('Driver is unavailable')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Driver is unavailable')
  expect(installation.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Retry installation' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Prepare / })).toBeEnabled()
})
