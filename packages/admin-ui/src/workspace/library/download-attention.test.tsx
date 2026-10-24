import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { highlightDownloads, useDownloadAttention } from './download-attention'
import { useDownloadAttention as useTerminalAttention } from '../../../../../src/tui/workspace/use-download-attention'

afterEach(() => vi.useRealTimers())
it('restarts the web highlight after each blocked attempt', () => {
  const view = renderHook(useDownloadAttention)
  expect(view.result.current).toBe(0)
  act(highlightDownloads)
  expect(view.result.current).toBe(1)
  act(highlightDownloads)
  expect(view.result.current).toBe(2)
  view.unmount()
})
it.each([true, false])('bounds terminal attention and respects motion=%s', (motion) => {
  vi.useFakeTimers()
  const view = renderHook(({ request }) => useTerminalAttention(request, motion), {
    initialProps: { request: 0 },
  })
  expect(view.result.current).toBe(false)
  view.rerender({ request: 1 })
  const phases = [view.result.current]
  for (let i = 0; i < 6; i++) {
    act(() => vi.advanceTimersByTime(250))
    phases.push(view.result.current)
  }
  expect(phases).toEqual(
    motion ? [true, false, true, false, true, false, false] : [true, true, true, true, true, true, false]
  )
  view.rerender({ request: 2 })
  expect(view.result.current).toBe(true)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
