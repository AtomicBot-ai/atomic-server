import { render, Text } from 'ink'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeTerminal } from '../../../test/helpers/fake-terminal.js'
import type { WorkspaceController } from './controller.js'
import { createWorkspace } from './state.js'
import type { WorkspaceState } from './state.js'
import { useSharedPanels } from './shared-panels.js'

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  vi.useRealTimers()
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  vi.useRealTimers()
})

async function mount(state: WorkspaceState, read: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers()
  const latest = { current: state }
  const controller = { current: { runtime: { read } } as unknown as WorkspaceController }
  function Probe() {
    useSharedPanels(true, latest, controller, (fn) => {
      latest.current = fn(latest.current)
    })
    return <Text>Shared status</Text>
  }
  const terminal = fakeTerminal()
  let ui!: ReturnType<typeof render>
  await act(async () => {
    ui = render(<Probe />, { ...terminal.streams, patchConsole: false })
  })
  cleanup.push(async () => {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  })
  return latest
}

it('refreshes cloud connection tags while retaining credentials being edited locally', async () => {
  const read = vi.fn().mockResolvedValue({ providers: [{ provider: 'anthropic', connected: true }] })
  const initial = createWorkspace('welcome')
  const latest = await mount(
    {
      ...initial,
      firstRun: 'cloud',
      overlay: 'cloud',
      cloud: { ...initial.cloud, key: 'unsaved-local-key', editing: true },
    },
    read
  )
  await act(async () => vi.advanceTimersByTimeAsync(2500))
  expect(latest.current.cloud).toMatchObject({
    key: 'unsaved-local-key',
    editing: true,
    providers: [{ provider: 'anthropic', connected: true }],
  })
  expect(latest.current.overlay).toBe('cloud')
})

it('updates remote engine settings without discarding edits or advancing their conflict revision', async () => {
  const read = vi.fn().mockResolvedValue({ revision: 4, values: { context: 4096, threads: 8 } })
  const initial = {
    ...createWorkspace('server'),
    overlay: 'engine-panel',
    enginePanel: {
      engine: 'llamacpp-upstream',
      mode: 'settings',
      busy: false,
      form: {
        descriptors: [],
        values: { context: 2048, threads: 2 },
        draft: { context: 8192 },
        revision: 3,
        gpus: [],
      },
    },
  } as unknown as WorkspaceState
  const latest = await mount(initial, read)
  await act(async () => vi.advanceTimersByTimeAsync(2500))
  expect(latest.current.enginePanel?.form).toMatchObject({
    values: { context: 4096, threads: 8 },
    draft: { context: 8192 },
    revision: 3,
  })
})
