import { act, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { useEngineSettingsData } from './use-engine-settings-data'

it('refreshes saved fields while keeping edits and their original conflict revision', async () => {
  let settings = { revision: 1, values: { context: 2048, threads: 2 } }
  const { workspace } = workspaceFixture({ 'settings.get': () => settings, 'settings.schema': [] })
  const { result } = renderHook(() => useEngineSettingsData('llamacpp-upstream', workspace.execute))
  await waitFor(() => expect(result.current.loading).toBe(false))
  act(() => result.current.setValues({ ...result.current.values, context: 8192 }))
  settings = { revision: 2, values: { context: 4096, threads: 8 } }
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'))
  })
  expect(result.current.values).toEqual({ context: 8192, threads: 8 })
  expect(result.current.saved).toEqual(settings.values)
  expect(result.current.revision).toBe(1)
  act(() => result.current.setValues({ ...result.current.saved }))
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'))
  })
  expect(result.current.revision).toBe(2)
})

it('accepts remote changes and their revision after returning an implicit default to its original value', async () => {
  let settings: { revision: number; values: Record<string, unknown> } = { revision: 1, values: {} }
  const { workspace } = workspaceFixture({
    'settings.get': () => settings,
    'settings.schema': { descriptors: [{ key: 'mtp', controllerProps: { value: false } }] },
  })
  const { result } = renderHook(() => useEngineSettingsData('llamacpp-upstream', workspace.execute))
  await waitFor(() => expect(result.current.loading).toBe(false))
  act(() => result.current.setValues({ mtp: true }))
  act(() => result.current.setValues({ mtp: false }))
  settings = { revision: 2, values: { mtp: true } }
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'))
  })
  expect(result.current.values).toEqual({ mtp: true })
  expect(result.current.revision).toBe(2)
})
