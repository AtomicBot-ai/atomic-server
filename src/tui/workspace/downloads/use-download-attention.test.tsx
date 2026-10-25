import { render, Text } from 'ink'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeTerminal } from '../../../../test/helpers/fake-terminal.js'
import { useDownloadAttention } from './use-download-attention.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.useRealTimers()
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

it.each([true, false])('bounds terminal attention and respects motion=%s', async (motion) => {
  vi.useFakeTimers()
  const seen: boolean[] = []
  function Probe({ request }: { request: number }) {
    const on = useDownloadAttention(request, motion)
    seen.push(on)
    return <Text>{on ? 'on' : 'off'}</Text>
  }
  const terminal = fakeTerminal()
  let ui!: ReturnType<typeof render>
  await act(async () => {
    ui = render(<Probe request={0} />, { ...terminal.streams, patchConsole: false })
  })
  cleanup.push(async () => {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  })
  expect(seen.at(-1)).toBe(false)
  await act(async () => ui.rerender(<Probe request={1} />))
  const phases = [seen.at(-1)]
  for (let i = 0; i < 6; i++) {
    await act(async () => vi.advanceTimersByTime(250))
    phases.push(seen.at(-1))
  }
  expect(phases).toEqual(
    motion ? [true, false, true, false, true, false, false] : [true, true, true, true, true, true, false]
  )
  await act(async () => ui.rerender(<Probe request={2} />))
  expect(seen.at(-1)).toBe(true)
})
