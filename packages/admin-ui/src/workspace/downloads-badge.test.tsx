import { cleanup, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { WorkspaceNavigation } from './WorkspaceNavigation'

function sidebar(setups: unknown[], downloads: unknown[]) {
  const { workspace } = workspaceFixture({})
  workspace.snapshot!.setups = setups as never
  workspace.snapshot!.downloads = downloads as never
  render(
    <WorkspaceNavigation
      page="catalog"
      section="catalog"
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
  return screen.getByRole('button', { name: /^Downloads/ })
}

// The badge counts what the Downloads page still shows: a finished transfer is not one.
it('shows a count for downloads under way and none once they are done', () => {
  const finished = { taskId: 't1', state: 'completed', transferred: 10, total: 10 }
  expect(sidebar([], [finished]).querySelector('small')).toBeNull()
  cleanup()
  const job = {
    setup_id: 's1',
    stage: 'downloading_model',
    plan: { model_id: 'm', total_download_bytes: 10 },
    task_ids: { model: 't2' },
  }
  expect(
    sidebar([job], [{ taskId: 't2', state: 'downloading', transferred: 1, total: 10 }]).querySelector('small')
  ).toHaveTextContent('1')
})
