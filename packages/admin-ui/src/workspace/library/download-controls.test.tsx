import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Downloads } from './Downloads'
import { InstalledModels } from './InstalledModels'
it('pauses directly and asks before discarding the selected transfer', async () => {
  const { workspace, execute } = workspaceFixture(
    {},
    {
      setups: [
        {
          id: 'media',
          stage: 'downloading',
          plan: { category: 'image', model_id: 'Flux', total_download_bytes: 100 },
        },
      ],
    }
  )
  render(<Downloads workspace={workspace} />)
  await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
  expect(execute).toHaveBeenCalledWith('artifacts.cancel', { id: 'media' })
  await userEvent.click(screen.getByTitle('Remove download Flux'))
  const dialog = await screen.findByRole('dialog', { name: 'Remove download?' })
  expect(execute).not.toHaveBeenCalledWith('downloads.remove', expect.anything())
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByTitle('Remove download Flux'))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove download' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('downloads.remove', { id: 'media', owner: 'artifacts' })
  )
})
it('deletes an installed image model through a confirmation, keeping the model visible until success', async () => {
  const { workspace, execute } = workspaceFixture({})
  const changed = vi.fn()
  render(
    <InstalledModels
      workspace={workspace}
      installed={[{ id: 'image', stage: 'ready', plan: { name: 'Image', category: 'image' } }]}
      loading={false}
      openCommand={vi.fn()}
      browse={vi.fn()}
      onChanged={changed}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: '× Delete' }))
  expect(execute).not.toHaveBeenCalled()
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete model' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('downloads.remove', {
      id: 'image',
      owner: 'artifacts',
      installed: true,
    })
  )
  expect(changed).toHaveBeenCalledOnce()
})

it('keeps a finished model visible without Pause and confirms deleting its installed files', async () => {
  const { workspace, execute } = workspaceFixture(
    {},
    { setups: [{ setup_id: 'done', stage: 'ready', plan: { model_id: 'Qwen', total_download_bytes: 100 } }] }
  )
  render(<Downloads workspace={workspace} />)
  expect(screen.getByText('Qwen')).toBeInTheDocument()
  expect(screen.getByText('Downloaded')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete model Qwen' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete model' }))
  expect(execute).toHaveBeenCalledWith('downloads.remove', { id: 'done', owner: 'setup', installed: true })
})
