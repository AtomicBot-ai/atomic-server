import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogBrowse } from './CatalogBrowse'
import { workspaceFixture } from '@/test/workspace-fixture'
import type { Execute } from '../../types'
const props = (execute: Execute) => ({
  catalog: [],
  category: 'text',
  format: 'gguf' as const,
  query: '',
  engines: [],
  loading: false,
  execute,
  setCategory: vi.fn(),
  setFormat: vi.fn(),
  setQuery: vi.fn(),
  search: vi.fn(),
  choose: vi.fn(),
  importFile: vi.fn(),
})
afterEach(() => vi.useRealTimers())
it('polls sequentially across ticks and panel remounts and publishes the completed scan', async () => {
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  const pending = new Promise((yes) => {
    resolve = yes
  })
  const { execute } = workspaceFixture({ 'models.installed': () => pending, 'artifacts.list': [] })
  const p = props(execute as Execute)
  const old = render(<CatalogBrowse {...p} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7500)
  })
  expect(execute.mock.calls.filter(([name]) => name === 'models.installed')).toHaveLength(1)
  old.unmount()
  render(<CatalogBrowse {...p} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500)
  })
  expect(execute.mock.calls.filter(([name]) => name === 'models.installed')).toHaveLength(1)
  await act(async () => resolve([{ id: 'local', name: 'Local model', provider: 'llamacpp-upstream' }]))
  expect(screen.getByText('Local model', { selector: 'strong' })).toBeInTheDocument()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2500)
  })
  expect(execute.mock.calls.filter(([name]) => name === 'models.installed')).toHaveLength(2)
})
