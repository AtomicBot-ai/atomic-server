import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Downloads } from './Downloads'
import { EnginesTab } from './EnginesTab'

it('shows engine progress and a retry only for failed jobs without model pause or delete actions', async () => {
  const fixture = workspaceFixture(
    {},
    {
      downloads: [
        {
          id: 'engine',
          taskId: 'engine',
          kind: 'engine',
          name: 'Atomic Prism',
          stage: 'downloading',
          transferred: 20,
          total: 100,
        },
        {
          id: 'failed',
          taskId: 'failed',
          kind: 'engine',
          name: 'llama.cpp',
          stage: 'failed',
          error: 'Network unavailable',
        },
      ],
    }
  )
  render(<Downloads workspace={fixture.workspace} />)
  expect(screen.getByText('Atomic Prism')).toBeInTheDocument()
  expect(screen.getAllByRole('progressbar')[0]).toHaveAttribute('value', '20')
  expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Remove download|Delete model/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(fixture.execute).toHaveBeenCalledWith('engines.retry', { id: 'failed' }))
})
it('marks only actual installed engine builds as installed', () => {
  render(
    <EnginesTab
      engines={[
        { engine: 'llamacpp-upstream', active: { version: 'b1' } },
        { engine: 'atomic-prism', builds: [{ version: 'p1' }] },
        { engine: 'llamacpp' },
      ]}
      loading={false}
      execute={vi.fn()}
      onManaged={vi.fn()}
      onFoundry={vi.fn()}
      onSettings={vi.fn()}
    />
  )
  expect(screen.getByText('Installed · b1')).toBeInTheDocument()
  expect(screen.getByText('Installed')).toBeInTheDocument()
  expect(screen.getByText('Not installed')).toBeInTheDocument()
})
