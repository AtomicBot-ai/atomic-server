import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import type { WorkspaceSnapshot } from '@contract'
import { snapshotFixture } from '@/test/workspace-fixture'
import { workspaceApi } from '../workspace-api'
import { useWorkspace } from '../useWorkspace'
import { FloatingDownloads } from './FloatingDownloads'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const engine = snapshotFixture({
  downloads: [
    { id: 'engine', kind: 'engine', name: 'llama.cpp', state: 'downloading', transferred: 25, total: 100 },
  ],
})
const model = snapshotFixture({
  setups: [
    {
      setup_id: 'model',
      stage: 'downloading_model',
      plan: { model_id: 'Qwen 4B', total_download_bytes: 1000 },
      task_ids: { model: 'transfer' },
    },
  ],
  downloads: [{ taskId: 'transfer', transferred: 250, total: 1000 }],
})
function Status() {
  return <FloatingDownloads workspace={useWorkspace()} onboarding />
}

it('replaces the engine with model progress without input when snapshots take longer than the polling interval', async () => {
  vi.useFakeTimers()
  const pending: Array<(snapshot: WorkspaceSnapshot) => void> = []
  vi.spyOn(workspaceApi, 'operations').mockResolvedValue([...WORKSPACE_OPERATIONS])
  vi.spyOn(workspaceApi, 'snapshot')
    .mockResolvedValueOnce(engine)
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
  render(<Status />)
  await act(async () => {})
  expect(screen.getByText('llama.cpp')).toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(pending).toHaveLength(2)
  await act(async () => pending[0]!(model))
  expect(screen.getByText('Qwen 4B')).toBeInTheDocument()
  expect(screen.queryByText('llama.cpp')).not.toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '25')
  await act(async () =>
    pending[1]!({ ...model, downloads: [{ taskId: 'transfer', transferred: 500, total: 1000 }] })
  )
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50')
})

it('ignores an older response that arrives after a newer model snapshot', async () => {
  vi.useFakeTimers()
  const pending: Array<(snapshot: WorkspaceSnapshot) => void> = []
  vi.spyOn(workspaceApi, 'operations').mockResolvedValue([...WORKSPACE_OPERATIONS])
  vi.spyOn(workspaceApi, 'snapshot')
    .mockResolvedValueOnce(engine)
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)))
  render(<Status />)
  await act(async () => {})
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  await act(async () => pending[1]!(model))
  await act(async () => pending[0]!(engine))
  expect(screen.getByText('Qwen 4B')).toBeInTheDocument()
  expect(screen.queryByText('llama.cpp')).not.toBeInTheDocument()
})
