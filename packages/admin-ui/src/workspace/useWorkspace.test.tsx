import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import { snapshotFixture } from '@/test/workspace-fixture'
import { workspaceApi } from './workspace-api'
import { useWorkspace } from './useWorkspace'

afterEach(() => vi.restoreAllMocks())

it('does not create snapshot-read feedback loops, while mutations refresh the shared state', async () => {
  const snapshot = vi.spyOn(workspaceApi, 'snapshot').mockResolvedValue(snapshotFixture())
  vi.spyOn(workspaceApi, 'operations').mockResolvedValue([...WORKSPACE_OPERATIONS])
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue({} as never)
  const view = renderHook(() => useWorkspace())
  await waitFor(() => expect(view.result.current.loading).toBe(false))
  await act(async () => {
    await view.result.current.execute('models.installed')
    await view.result.current.execute('artifacts.list')
    await view.result.current.execute('cloud.list')
  })
  expect(snapshot).toHaveBeenCalledTimes(1)
  await act(async () => {
    await view.result.current.execute('setup.manual')
  })
  expect(snapshot).toHaveBeenCalledTimes(2)
})
