import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { InstalledModels } from './InstalledModels'

const active = {
  id: 'current',
  kind: 'chat' as const,
  provider: 'mlx',
  model: 'current',
  state: 'ready' as const,
  details: {},
}

it('requires confirmation before replacing a loaded model and retains late load errors in the dialog', async () => {
  let reject!: (error: Error) => void
  const pending = new Promise((_, fail) => {
    reject = fail
  })
  const { workspace, execute } = workspaceFixture({ 'models.load': () => pending }, { services: [active] })
  render(
    <InstalledModels
      workspace={workspace}
      installed={[{ id: 'next', providers: ['mlx', 'atomic-prism'] }]}
      loading={false}
      openCommand={vi.fn()}
      browse={vi.fn()}
    />
  )
  const engine = screen.getByRole('combobox', { name: 'Load next with' })
  expect(within(engine).getByRole('option', { name: 'MLX' })).toHaveValue('mlx')
  expect(within(engine).getByRole('option', { name: 'Atomic Prism' })).toHaveValue('atomic-prism')
  expect(screen.getByText('MLX · Installed · not loaded')).toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: 'Load model' })
  await userEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Load next?' })
  expect(execute).not.toHaveBeenCalled()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Load model' }))
  expect(execute).toHaveBeenCalledWith('models.load', { provider: 'mlx', model_id: 'next' })
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  await act(async () => reject(new Error('GPU is busy')))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('GPU is busy')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('alert')).toHaveTextContent('GPU is busy')
  expect(trigger).toHaveFocus()
})

it.each([true, false])(
  'confirms unloading from the compact=%s model view and Escape leaves the service running',
  async (compact) => {
    const { workspace, execute } = workspaceFixture({}, { services: [active] })
    render(
      <InstalledModels
        compact={compact}
        workspace={workspace}
        installed={[{ id: 'current', providers: ['mlx'] }]}
        loading={false}
        openCommand={vi.fn()}
        browse={vi.fn()}
      />
    )
    const trigger = screen.getByRole('button', { name: 'Unload' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(execute).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
    await userEvent.click(trigger)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unload model' }))
    expect(execute).toHaveBeenCalledWith('models.unload', { provider: 'mlx', model_id: 'current' })
  }
)
