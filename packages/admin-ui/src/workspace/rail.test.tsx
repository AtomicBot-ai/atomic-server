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
