import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { useWorkspace } from './useWorkspace'
import { workspaceApi } from './workspace-api'
import { WorkspaceApp } from './WorkspaceApp'

vi.mock('./useWorkspace', () => ({ useWorkspace: vi.fn() }))
vi.mock('@/hooks/useServiceHub', async (original) => ({
  ...(await original<typeof import('@/hooks/useServiceHub')>()),
  useServiceHub: () => ({}),
}))
vi.mock('./intro/EngineIntro', () => ({
  EngineIntro: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue}>Enter workspace</button>
  ),
}))

beforeEach(() => {
  vi.mocked(useWorkspace).mockReturnValue(workspaceFixture({}).workspace)
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

async function open() {
  render(<WorkspaceApp />)
  await userEvent.click(screen.getByRole('button', { name: 'Enter workspace' }))
}

it.each([
  ['Audio', 'audio'],
  ['Images', 'image'],
  ['Videos', 'video'],
])('opens the %s catalog from its studio', async (label, category) => {
  await open()
  await userEvent.click(screen.getByRole('button', { name: 'Playground', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: label, exact: true }))
  await userEvent.click(screen.getAllByRole('button', { name: 'Choose a model', exact: true })[0])
  await userEvent.click(screen.getByRole('button', { name: 'Browse models', exact: true }))
  expect(await screen.findByLabelText('Model category')).toHaveValue(category)
})

it.each(['¡', '№'])('uses the physical digit for Option navigation with key %s', async (key) => {
  await open()
  fireEvent.keyDown(window, { key, code: 'Digit2', altKey: true })
  expect(screen.getByRole('button', { name: 'Playground', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  fireEvent.keyDown(window, { key, code: 'Digit1', altKey: true, ctrlKey: true })
  fireEvent.keyDown(window, { key, code: 'Digit1', altKey: true, isComposing: true })
  expect(screen.getByRole('button', { name: 'Playground', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  fireEvent.keyDown(window, { key, code: 'Digit1', altKey: true })
  expect(screen.getByRole('button', { name: 'Server', exact: true })).toHaveAttribute('aria-current', 'page')
})
