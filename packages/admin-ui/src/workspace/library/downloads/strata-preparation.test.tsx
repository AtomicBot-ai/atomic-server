import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { FloatingDownloads } from './FloatingDownloads'
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

it('names the model and shows an indeterminate preparation without a transfer estimate', () => {
  const { workspace } = workspaceFixture(
    {},
    {
      setups: [
        {
          id: 'strata-job',
          kind: 'strata-model',
          stage: 'preparing',
          plan: { model_id: 'iq3-xxs-dflash2', name: 'Qwen3.8-Flash-Next IQ3_XXS', download_bytes: 100 },
        },
      ],
    }
  )
  render(
    <>
      <Downloads workspace={workspace} />
      <FloatingDownloads workspace={workspace} />
    </>
  )
  expect(screen.getAllByText('Qwen3.8-Flash-Next IQ3_XXS')).toHaveLength(2)
  expect(screen.getAllByText('Preparing Strata model. This can take a few minutes.')).toHaveLength(2)
  for (const progress of screen.getAllByRole('progressbar')) expect(progress).not.toHaveAttribute('value')
  expect(screen.queryByText(/Size pending|Estimating time/)).not.toBeInTheDocument()
})
