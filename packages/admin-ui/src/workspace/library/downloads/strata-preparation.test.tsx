import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Downloads } from './Downloads'

it('shows core preparation progress and pauses the same Strata installation', async () => {
  const { workspace, execute } = workspaceFixture(
    {},
    {
      setups: [
        {
          id: 'strata-job',
          kind: 'strata-model',
          stage: 'preparing',
          plan: { model_id: 'strata-model', download_bytes: 100, digest: 'pinned' },
          preparation: { completed_bytes: 5, total_bytes: 20, revision: 2, state: 'preparing' },
        },
      ],
    }
  )
  render(<Downloads workspace={workspace} />)
  expect(screen.getByText('Preparing model')).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveValue(25)
  await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
  expect(execute).toHaveBeenCalledWith('strata.cancel', { id: 'strata-job' })
})
