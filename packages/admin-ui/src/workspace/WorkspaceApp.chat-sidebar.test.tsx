import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { useWorkspace } from './useWorkspace'
import { workspaceApi } from './workspace-api'
import { WorkspaceApp } from './WorkspaceApp'

vi.mock('./useWorkspace', () => ({ useWorkspace: vi.fn() }))
vi.mock('@/hooks/useServiceHub', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useServiceHub')>()),
  useServiceHub: () => ({}),
}))
vi.mock('./intro/EngineIntro', () => ({
  EngineIntro: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue}>Enter workspace</button>
  ),
}))

const preferenceKey = 'atomic:playground:preferences:v1'
const resize = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  act(() => window.dispatchEvent(new Event('resize')))
}
beforeEach(() => {
  resize(1280)
  const { workspace } = workspaceFixture({})
  vi.mocked(useWorkspace).mockReturnValue(workspace)
  vi.spyOn(workspaceApi, 'execute').mockImplementation(async (name) => {
    if (name === 'history.list') return [{ id: 'saved', title: 'Saved conversation' }] as never
    if (name === 'history.load')
      return {
        id: 'saved',
        title: 'Saved conversation',
        messages: [{ role: 'user', content: 'A saved message' }],
      } as never
    return [] as never
  })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  resize(1280)
})

async function openChat() {
  const view = render(<WorkspaceApp />)
  await userEvent.click(screen.getByRole('button', { name: 'Enter workspace' }))
  await userEvent.click(screen.getByRole('button', { name: 'Playground' }))
  await waitFor(() => expect(workspaceApi.execute).toHaveBeenCalledWith('history.list'))
  return view
}

it('keeps history in the shared sidebar and preserves drafts and search through resize', async () => {
  const { container } = await openChat()
  const sidebar = container.querySelector<HTMLElement>('.desktop-sidebar')!
  expect(within(sidebar).getByRole('button', { name: /New chat/ })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /New chat/ })).toHaveLength(1)
  expect(container.querySelector('.chat-main .recents')).toBeNull()
  expect(container.querySelector('.chat-layout')).toHaveClass('history-in-sidebar')
  expect(screen.queryByRole('textbox', { name: 'Search conversations' })).not.toBeInTheDocument()
  await userEvent.click(within(sidebar).getByRole('button', { name: 'Saved conversation' }))
  expect(await screen.findByText('A saved message')).toBeInTheDocument()
  const draft = screen.getByRole('textbox', { name: 'Message' })
  fireEvent.change(draft, { target: { value: 'Keep this draft.' } })
  await userEvent.click(screen.getByRole('button', { name: 'Search conversations' }))
  fireEvent.change(await screen.findByRole('textbox', { name: 'Search conversations' }), {
    target: { value: 'Saved' },
  })
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
  expect(container.querySelector('.desktop-workspace')).toHaveClass('sidebar-collapsed')
  await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
  resize(480)
  await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
  expect(container.querySelector('.desktop-workspace')).toHaveClass('sidebar-open')
  await userEvent.click(screen.getByRole('button', { name: 'Search conversations' }))
  expect(await screen.findByRole('textbox', { name: 'Search conversations' })).toHaveValue('Saved')
  await userEvent.keyboard('{Escape}')
  expect(draft).toHaveValue('Keep this draft.')
  await userEvent.click(screen.getByRole('button', { name: 'Conversation actions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Hide history' }))
  await userEvent.keyboard('{Escape}')
  expect(within(sidebar).queryByRole('button', { name: 'Saved conversation' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /New chat/ })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Conversation actions' }))
  await userEvent.click(screen.getByRole('button', { name: 'History' }))
  await userEvent.keyboard('{Escape}')
  expect(within(sidebar).getByRole('button', { name: 'Saved conversation' })).toBeVisible()
  expect(screen.getByText('A saved message')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Message' })).toBe(draft)
  expect(draft).toHaveValue('Keep this draft.')
  expect(vi.mocked(workspaceApi.execute).mock.calls.filter(([name]) => name === 'history.list')).toHaveLength(
    1
  )
}, 15000)

it('honors a saved hidden-history preference and keeps one working New chat action', async () => {
  localStorage.setItem(preferenceKey, JSON.stringify({ sidebar: false }))
  await openChat()
  expect(screen.queryByRole('button', { name: 'Saved conversation' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /New chat/ })).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'An unsent draft' } })
  await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
  await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''))
})

it('keeps global navigation and command shortcuts outside an open modal until Escape closes it', async () => {
  await openChat()
  const draft = screen.getByLabelText('Message')
  fireEvent.change(draft, { target: { value: 'Do not lose this draft.' } })
  await userEvent.click(screen.getByRole('button', { name: 'Chat options' }))
  await userEvent.click(screen.getByRole('button', { name: 'Preferences' }))
  const dialog = screen.getByRole('dialog', { name: 'Playground preferences' })
  fireEvent.keyDown(dialog, { key: 'F4' })
  fireEvent.keyDown(dialog, { key: 'F1' })
  fireEvent.keyDown(dialog, { key: '1', altKey: true })
  fireEvent.keyDown(dialog, { key: 'n', ctrlKey: true })
  expect(dialog).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Server commands' })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Help' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Playground' })).toHaveAttribute('aria-current', 'page')
  expect(draft).toHaveValue('Do not lose this draft.')
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(dialog).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  fireEvent.keyDown(window, { key: 'F4' })
  expect(screen.getByRole('region', { name: 'Server commands' })).toBeInTheDocument()
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.keyDown(window, { key: '1', altKey: true })
  expect(screen.getByRole('button', { name: 'Server' })).toHaveAttribute('aria-current', 'page')
})

it('keeps a pending history import above the workspace after resize and preserves its late failure', async () => {
  await openChat()
  await userEvent.click(screen.getByRole('button', { name: 'History options' }))
  await userEvent.click(screen.getByText('Import / export'))
  const file = new File(['unused'], 'conversations.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    value: async () => JSON.stringify([{ title: 'Imported', messages: [] }]),
  })
  await userEvent.upload(screen.getByLabelText('Import conversations (JSON / JSONL)'), file)
  const dialog = await screen.findByRole('dialog', { name: 'Import 1 conversation?' })
  expect(dialog.closest('.desktop-sidebar')).toBeNull()
  expect(dialog.closest('.desktop-workspace')).not.toBeNull()
  resize(480)
  expect(dialog).toBeInTheDocument()
  let reject!: (error: Error) => void
  vi.mocked(workspaceApi.execute).mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      })
  )
  await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
  expect(dialog).toHaveAttribute('aria-busy', 'true')
  fireEvent.keyDown(dialog, { key: 'F4' })
  fireEvent.keyDown(dialog, { key: '1', altKey: true })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(dialog).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Server commands' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Playground' })).toHaveAttribute('aria-current', 'page')
  await act(async () => reject(new Error('Import could not be saved.')))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Import could not be saved.')
  expect(within(dialog).getByRole('button', { name: 'Import' })).toBeEnabled()
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(dialog).not.toBeInTheDocument()
})
