import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { workspaceFixture, enginesList } from '@/test/workspace-fixture'
import type { Workspace } from '../useWorkspace'
import { EngineIntro } from './EngineIntro'
let workspace: Workspace
vi.mock('../useWorkspace', () => ({ useWorkspace: () => workspace }))
it('queues the chosen engine and proceeds before the background installation completes', async () => {
  let accept!: () => void
  const fixture = workspaceFixture(
    {
      'engines.list': enginesList(['llamacpp-upstream'], []),
      'engines.enqueue': () =>
        new Promise<void>((resolve) => {
          accept = resolve
        }),
    },
    { setup: null }
  )
  workspace = fixture.workspace
  const next = vi.fn()
  const view = render(<EngineIntro onContinue={next} />)
  const choose = await screen.findByRole('button', { name: 'Choose engine' })
  fireEvent.keyDown(window, { key: 'Enter', repeat: true })
  expect(screen.queryByRole('heading', { name: 'Choose your engine' })).not.toBeInTheDocument()
  fireEvent.click(choose)
  fireEvent.click(await screen.findByRole('button', { name: 'llama.cpp', exact: true }))
  expect(next).not.toHaveBeenCalled()
  await act(async () => accept())
  expect(next).toHaveBeenCalledOnce()
  expect(fixture.execute).toHaveBeenCalledWith('engines.enqueue', {
    engine: 'llamacpp-upstream',
    select: true,
  })
  expect(fixture.execute).not.toHaveBeenCalledWith('engines.select', expect.anything())
  view.unmount()
  expect(fixture.execute.mock.calls.some(([name]) => /cancel/.test(name))).toBe(false)
})
it('keeps a rejected queue request in the chooser and permits retry', async () => {
  let failed = true
  const fixture = workspaceFixture(
    {
      'engines.list': enginesList(['llamacpp-upstream'], []),
      'engines.enqueue': () => {
        if (failed) throw new Error('Download unavailable')
      },
    },
    { setup: null }
  )
  workspace = fixture.workspace
  const next = vi.fn()
  render(<EngineIntro onContinue={next} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Choose engine' }))
  fireEvent.click(await screen.findByRole('button', { name: 'llama.cpp', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Download unavailable')
  expect(screen.queryByRole('button', { name: 'Press any key' })).not.toBeInTheDocument()
  failed = false
  fireEvent.click(screen.getByRole('button', { name: 'llama.cpp', exact: true }))
  await waitFor(() => expect(next).toHaveBeenCalledOnce())
})
it('opens a returning user directly without replaying the intro', async () => {
  workspace = workspaceFixture({}).workspace
  const next = vi.fn()
  render(<EngineIntro onContinue={next} />)
  await waitFor(() => expect(next).toHaveBeenCalledOnce())
  expect(screen.queryByRole('button', { name: 'Press any key' })).not.toBeInTheDocument()
})
it('waits at the intro when an engine exists but onboarding has not started', async () => {
  workspace = workspaceFixture(
    { 'engines.list': enginesList(['llamacpp-upstream']) },
    { setup: null }
  ).workspace
  const next = vi.fn()
  render(<EngineIntro onContinue={next} />)
  await screen.findByRole('button', { name: 'Press any key' })
  expect(next).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { key: 'x' })
  expect(next).toHaveBeenCalledOnce()
})
it('resumes unfinished model setup directly', async () => {
  workspace = workspaceFixture({}, { setup: null, setups: [{ id: 'job', stage: 'paused' }] }).workspace
  const next = vi.fn()
  render(<EngineIntro onContinue={next} />)
  await waitFor(() => expect(next).toHaveBeenCalledOnce())
})

it('leaves an open engine chooser when another client completes onboarding', async () => {
  workspace = workspaceFixture(
    { 'engines.list': enginesList(['llamacpp-upstream'], []) },
    { setup: null }
  ).workspace
  const next = vi.fn()
  const view = render(<EngineIntro onContinue={next} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Choose engine' }))
  await screen.findByRole('heading', { name: 'Choose your engine' })
  workspace.snapshot = { ...workspace.snapshot!, setup: { mode: 'manual', complete: true, updated_at: 2 } }
  view.rerender(<EngineIntro onContinue={next} />)
  await waitFor(() => expect(next).toHaveBeenCalledOnce())
})

it('leaves checking immediately when setup completes during an engine-list request', async () => {
  let finish!: (value: unknown) => void
  workspace = workspaceFixture(
    {
      'engines.list': () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    },
    { setup: null }
  ).workspace
  const next = vi.fn()
  const view = render(<EngineIntro onContinue={next} />)
  await waitFor(() => expect(finish).toBeDefined())
  workspace.snapshot = { ...workspace.snapshot!, setup: { mode: 'manual', complete: true, updated_at: 2 } }
  view.rerender(<EngineIntro onContinue={next} />)
  expect(next).toHaveBeenCalledOnce()
  await act(async () => finish(enginesList(['llamacpp-upstream'])))
  expect(next).toHaveBeenCalledOnce()
})

it('returns from the engine picker to the focused intro without installing or skipping setup', async () => {
  const fixture = workspaceFixture(
    { 'engines.list': enginesList(['llamacpp-upstream'], []) },
    { setup: null }
  )
  workspace = fixture.workspace
  const next = vi.fn()
  render(<EngineIntro onContinue={next} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Choose engine' }))
  const engine = await screen.findByRole('button', { name: 'llama.cpp', exact: true })
  engine.focus()
  fireEvent.keyDown(engine, { key: 'Escape' })
  expect(screen.getByRole('heading', { name: 'Atomic Server' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Choose engine' })).toHaveFocus()
  expect(screen.queryByRole('heading', { name: 'Choose your engine' })).not.toBeInTheDocument()
  expect(next).not.toHaveBeenCalled()
  expect(fixture.execute.mock.calls.some(([name]) => name === 'engines.enqueue')).toBe(false)
  fireEvent.keyDown(window, { key: 'Escape', repeat: true })
  expect(screen.getByRole('button', { name: 'Choose engine' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Choose engine' }))
  await screen.findByRole('heading', { name: 'Choose your engine' })
  fireEvent.click(screen.getByRole('button', { name: 'Set up later' }))
  expect(next).toHaveBeenCalledOnce()
})
