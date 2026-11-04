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
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
  vi.mocked(useWorkspace).mockReturnValue(workspaceFixture({}).workspace)
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
})

it.each(['¡', '№'])('leaves Option typing in a text field alone (%s)', async (key) => {
  await open()
  await userEvent.click(screen.getByRole('button', { name: 'Playground', exact: true }))
  const draft = screen.getByRole('textbox', { name: 'Message' })
  draft.focus()
  expect(fireEvent.keyDown(draft, { key, code: 'Digit1', altKey: true })).toBe(true)
  expect(screen.getByRole('button', { name: 'Playground', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
})

it('starts with a collapsed sidebar at 1024 and closes the drawer after choosing a task', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  await open()
  expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(screen.getByRole('button', { name: 'Playground', exact: true }))
  expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Images', exact: true }))
  expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument()
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
  await userEvent.click(screen.getAllByRole('button', { name: `Choose ${category} model`, exact: true })[0])
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
