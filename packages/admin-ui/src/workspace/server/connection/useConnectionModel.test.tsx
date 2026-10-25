import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { useConnectionModel } from './useConnectionModel'

const models = [
  { id: 'first', providers: ['llamacpp-upstream'] },
  { id: 'saved', providers: ['llamacpp-upstream'] },
]

it('restores the saved model once and preserves an explicit choice through retries and shared refreshes', async () => {
  const { workspace, execute } = workspaceFixture({
    'models.installed': models,
    'config.get': { values: { tui: { model: 'saved' } } },
  })
  const { result, rerender } = renderHook((value) => useConnectionModel(value), { initialProps: workspace })
  await waitFor(() => expect(result.current.selected.ready).toBe(true))
  expect(result.current.modelId).toBe('saved')
  act(() => result.current.choose('first'))
  await waitFor(() => expect(result.current.checking).toBe(false))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.checking).toBe(false))
  rerender({
    ...workspace,
    snapshot: { ...workspace.snapshot!, setups: [{ id: 'another', stage: 'ready' }] },
  })
  await waitFor(() => expect(result.current.checking).toBe(false))
  expect(result.current.modelId).toBe('first')
  expect(execute.mock.calls.filter(([name]) => name === 'config.get')).toHaveLength(1)
})

it('does not replace a deliberate picker choice when a delayed saved setting arrives', async () => {
  let finish!: (value: unknown) => void
  const { workspace } = workspaceFixture({
    'models.installed': models,
    'config.get': () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  const { result } = renderHook(() => useConnectionModel(workspace))
  await waitFor(() => expect(finish).toBeDefined())
  act(() => result.current.choose('first'))
  await waitFor(() => expect(result.current.selected.ready).toBe(true))
  await act(async () => finish({ values: { tui: { model: 'saved' } } }))
  expect(result.current.modelId).toBe('first')
  expect(result.current.selected.ready).toBe(true)
})
