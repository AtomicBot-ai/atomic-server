import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { WorkspaceNavigation } from './WorkspaceNavigation'

function rail() {
  const { workspace } = workspaceFixture({})
  render(
    <WorkspaceNavigation
      page="server"
      section="overview"
      task="chat"
      workspace={workspace}
      navigate={vi.fn()}
      selectSection={vi.fn()}
      selectTask={vi.fn()}
      connectAgent={vi.fn()}
      prepared={[]}
      openHelp={vi.fn()}
    />
  )
}

// The rail is the menu: its shortcuts count along it, and it offers nothing that opens itself again.
it('numbers the shortcuts in the order of the rail and has no Web item', () => {
  rail()
  const titles = ['Server', 'Playground', 'Models', 'Settings'].map((name) =>
    screen.getByRole('button', { name }).getAttribute('title')
  )
  expect(titles).toEqual(['Server · Alt+1', 'Playground · Alt+2', 'Models · Alt+3', 'Settings · Alt+4'])
  expect(screen.queryByRole('link', { name: 'Web' })).not.toBeInTheDocument()
})

// Settings → Keyboard shortcuts says what the keys do: the same order as the rail (0.2.7 retest B07).
it('lists the page shortcuts in Settings in the order the keys open them', async () => {
  const { Settings } = await import('./server/settings/Settings')
  const { workspace } = workspaceFixture({})
  render(<Settings workspace={workspace} section="shortcuts" openCommand={vi.fn()} openEngines={vi.fn()} />)
  const rows = [...document.querySelectorAll('.settings-shortcuts > div')].map((row) => [
    row.querySelector('dt')?.textContent,
    row.querySelector('kbd')?.textContent,
  ])
  expect(rows.slice(0, 4)).toEqual([
    ['Server', 'Alt+1'],
    ['Playground', 'Alt+2'],
    ['Models', 'Alt+3'],
    ['Settings', 'Alt+4'],
  ])
})
