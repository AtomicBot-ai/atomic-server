import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { OptionalMedia } from './OptionalMedia'
it('keeps the successful category available when another catalog fails and supports retry', async () => {
  let fails = true
  const { workspace } = workspaceFixture({
    'models.catalog': (input: Record<string, unknown>) => {
      if (input.category === 'video' && fails) throw Error('Video catalog unavailable')
      return [{ id: String(input.category), name: String(input.category) + ' model' }]
    },
  })
  const select = vi.fn()
  render(<OptionalMedia workspace={workspace} select={select} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Video catalog unavailable')
  await userEvent.click(screen.getByRole('button', { name: 'Add to queue' }))
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'image' }), 'image')
  fails = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add to queue' })).toHaveLength(2))
})
it('recognizes a completed quantized media job and requires confirmation before deletion', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      'models.catalog': (input: Record<string, unknown>) => [
        { id: input.category, name: String(input.category) + ' model' },
      ],
    },
    {
      setups: [{ id: 'media-job', stage: 'ready', plan: { category: 'image', model_id: 'image:Q4' } }],
    }
  )
  render(<OptionalMedia workspace={workspace} select={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Delete model', exact: true }))
  expect(screen.getByRole('dialog', { name: 'Delete model?' })).toBeInTheDocument()
  expect(execute).not.toHaveBeenCalledWith('downloads.remove', expect.anything())
  await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete model', exact: true }))
  await userEvent.click(screen.getAllByRole('button', { name: 'Delete model', exact: true })[1])
  expect(execute).toHaveBeenCalledWith('downloads.remove', {
    id: 'media-job',
    owner: 'artifacts',
    installed: true,
  })
})
it('keeps retry and removal separate and controls the newest media download', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      'models.catalog': (input: Record<string, unknown>) =>
        input.category === 'image' ? [{ id: 'image', name: 'Image model' }] : [],
    },
    {
      setups: [
        { id: 'old-job', stage: 'failed', updated_at: 1, plan: { category: 'image', model_id: 'image:Q4' } },
        { id: 'new-job', stage: 'paused', updated_at: 2, plan: { category: 'image', model_id: 'image:Q4' } },
      ],
    }
  )
  render(<OptionalMedia workspace={workspace} select={vi.fn()} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Resume' }))
  expect(execute).toHaveBeenCalledWith('artifacts.resume', { id: 'new-job' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Remove download Image model' }))
  expect(screen.getByRole('dialog', { name: 'Remove download?' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(execute).not.toHaveBeenCalledWith('downloads.remove', expect.anything())
  expect(screen.getByRole('button', { name: 'Remove download Image model' })).toHaveFocus()
})
