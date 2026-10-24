import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { highlightDownloads, useDownloadAttention } from './download-attention'

it('restarts the web highlight after each blocked attempt', () => {
  const view = renderHook(useDownloadAttention)
  expect(view.result.current).toBe(0)
  act(highlightDownloads)
  expect(view.result.current).toBe(1)
  act(highlightDownloads)
  expect(view.result.current).toBe(2)
  view.unmount()
})
