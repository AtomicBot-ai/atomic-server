import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import {
  SETTINGS_SECTIONS,
  SETTINGS_WORKSPACE_SECTIONS,
  DEFAULT_ASSISTANT,
  DEFAULT_ATTACHMENTS,
} from '@contract'
import { workspaceFixture } from '@/test/workspace-fixture'
import { useThemeStore } from '@/hooks/useTheme'
import { Settings } from './Settings'
import { WorkspaceNavigation } from '../WorkspaceNavigation'

afterEach(() => {
  act(() => useThemeStore.getState().setTheme('dark'))
  localStorage.clear()
})
it('matches the desktop primary and workspace settings order without adding server config pages', () => {
  const { workspace } = workspaceFixture({})
  const selectSection = vi.fn()
  render(
    <WorkspaceNavigation
      page="settings"
      section="admin"
      task="chat"
      workspace={workspace}
      navigate={vi.fn()}
      selectSection={selectSection}
      selectTask={vi.fn()}
      connectAgent={vi.fn()}
      openHelp={vi.fn()}
      openSetup={vi.fn()}
    />
  )
  const navigation = within(screen.getByRole('navigation', { name: 'Settings sections' }))
  expect(navigation.getAllByRole('button').map((button) => button.textContent)).toEqual(
    [...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS].map((section) => section.label)
  )
  expect(navigation.getByText('Workspace')).toBeInTheDocument()
  expect(navigation.queryByRole('button', { name: 'Network & API' })).not.toBeInTheDocument()
})
it('opens and saves the supported server groups from General with isolated drafts', async () => {
  const { workspace, execute } = workspaceFixture({
    'config.get': {
      values: { admin: { autoStart: true }, models: { autoLoad: [] } },
      fields: [
        { path: 'admin.autoStart', type: 'boolean' },
        { path: 'models.autoLoad', type: 'string[]' },
      ],
    },
  })
  render(<Settings workspace={workspace} section="admin" openCommand={vi.fn()} openEngines={vi.fn()} />)
  expect(await screen.findByRole('switch', { name: 'Start web admin automatically' })).toBeChecked()
  await userEvent.click(screen.getByText('Startup models', { selector: 'summary' }))
  await userEvent.type(await screen.findByLabelText('Models to load on start'), 'local-model')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('config.update', { values: { 'models.autoLoad': ['local-model'] } })
  )
})
it('applies the actual browser theme and resets it while keeping terminal controls in their own group', async () => {
  const { workspace } = workspaceFixture({
    'config.get': { values: { tui: { motion: true } }, fields: [{ path: 'tui.motion', type: 'boolean' }] },
  })
  render(<Settings workspace={workspace} section="tui" openCommand={vi.fn()} openEngines={vi.fn()} />)
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'light')
  expect(document.documentElement).not.toHaveClass('dark')
  expect(localStorage.getItem('atc-admin:theme')).toBe('light')
  await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
  expect(document.documentElement).toHaveClass('dark')
  await userEvent.click(screen.getByText('Terminal interface', { selector: 'summary' }))
  expect(await screen.findByRole('switch', { name: 'Animate the server eye' })).toBeChecked()
})
it.each([
  ['attachments', 'Document attachments'],
  ['assistants', 'Add assistant'],
  ['connectors', 'Add Server'],
  ['skills', 'Create new skill'],
])('renders working desktop %s controls backed by shared operations', async (section, control) => {
  const { workspace } = workspaceFixture({})
  render(<Settings workspace={workspace} section={section} openCommand={vi.fn()} openEngines={vi.fn()} />)
  expect(screen.getByRole(section === 'attachments' ? 'switch' : 'button', { name: control })).toBeEnabled()
  expect(screen.queryByText(/unavailable on this server/)).not.toBeInTheDocument()
})
it('creates an assistant with its system prompt through the server and closes its dialog', async () => {
  const { workspace, execute } = workspaceFixture({})
  render(<Settings workspace={workspace} section="assistants" openCommand={vi.fn()} openEngines={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Add assistant' }))
  await userEvent.type(screen.getByLabelText('Name'), 'Reviewer')
  await userEvent.type(screen.getByLabelText('Instructions'), 'Review the changes.')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('assistants.save', {
      value: { name: 'Reviewer', avatar: '*', parameters: {}, instructions: 'Review the changes.' },
    })
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('changes the default assistant through the app menu and reflects shared saved state', async () => {
  const { workspace, execute } = workspaceFixture(
    {},
    {
      features: {
        assistants: [DEFAULT_ASSISTANT, { ...DEFAULT_ASSISTANT, id: 'reviewer', name: 'Reviewer' }],
        default_assistant: DEFAULT_ASSISTANT.id,
        skills: [],
        connectors: [],
        connector_status: {},
        attachments: DEFAULT_ATTACHMENTS,
      },
    }
  )
  const view = render(
    <Settings workspace={workspace} section="assistants" openCommand={vi.fn()} openEngines={vi.fn()} />
  )
  const picker = screen.getByRole('combobox', { name: 'Default assistant' })
  await userEvent.click(picker)
  expect(screen.getByRole('listbox', { name: 'Default assistant' })).toBeVisible()
  await userEvent.click(screen.getByRole('option', { name: 'Reviewer' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('assistants.default', { id: 'reviewer' }))
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(picker).toHaveFocus()
  workspace.snapshot!.features!.default_assistant = 'reviewer'
  view.rerender(
    <Settings workspace={workspace} section="assistants" openCommand={vi.fn()} openEngines={vi.fn()} />
  )
  expect(picker).toHaveTextContent('Reviewer')
  execute.mockClear()
  await userEvent.keyboard('{ArrowDown}{Home}{Escape}')
  expect(execute).not.toHaveBeenCalled()
  expect(picker).toHaveTextContent('Reviewer')
  expect(picker).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}{Home}{Enter}')
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('assistants.default', { id: DEFAULT_ASSISTANT.id })
  )
})

it('opens the desktop skill create menu and closes it on Escape', async () => {
  const { workspace } = workspaceFixture({})
  render(<Settings workspace={workspace} section="skills" openCommand={vi.fn()} openEngines={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Create new skill' }))
  expect(screen.getByRole('menu')).toBeVisible()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Create new skill' }))
  await userEvent.click(screen.getByRole('button', { name: 'Write skill instructions' }))
  expect(screen.getByRole('dialog', { name: 'Add skill' })).toBeVisible()
})
it('offers the same skill actions and routes Try in chat with the chosen skill', async () => {
  const { workspace } = workspaceFixture(
    {},
    {
      features: {
        assistants: [DEFAULT_ASSISTANT],
        default_assistant: 'atomic-chat',
        skills: [
          {
            name: 'review',
            description: 'Review code',
            body: 'Inspect changes.',
            enabled: true,
            updated_at: 1,
          },
        ],
        connectors: [],
        connector_status: {},
        attachments: DEFAULT_ATTACHMENTS,
      },
    }
  )
  const listener = vi.fn()
  window.addEventListener('atomic:try-skill', listener)
  try {
    render(<Settings workspace={workspace} section="skills" openCommand={vi.fn()} openEngines={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for review' }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByRole('button', { name: 'Download' })).toBeEnabled()
    await userEvent.click(menu.getByRole('button', { name: 'Try in chat' }))
    expect(listener.mock.calls[0]?.[0].detail).toBe('review')
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Name')).toBeDisabled()
  } finally {
    window.removeEventListener('atomic:try-skill', listener)
  }
})
