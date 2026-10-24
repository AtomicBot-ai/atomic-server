import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from './SetupWizard'
import { WaitingSetup } from './WaitingSetup'
import { FloatingDownloads } from '../library/FloatingDownloads'

it('offers a playable final wait, local email confirmation and an exit while download continues', async () => {
  const { workspace, execute } = workspaceFixture(
    { 'cloud.list': [] },
    {
      setup: null,
      setups: [{ id: 'model', stage: 'downloading', plan: { model_id: 'Qwen', total_download_bytes: 1000 } }],
      downloads: [{ taskId: 'model', transferred: 400, total: 1000, eta_seconds: 60 }],
    }
  )
  const onDestination = vi.fn()
  render(
    <SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} onDestination={onDestination} />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Continue without permissions' }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Skip', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: /Connect an agent/ }))
  expect(screen.getByRole('heading', { name: 'Getting your model ready' })).toBeInTheDocument()
  const game = within(screen.getByRole('region', { name: 'Minesweeper' }))
  await userEvent.click(game.getByRole('gridcell', { name: 'Row 1, column 1, hidden' }))
  expect(game.queryByText('Mine hit')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Email me when it is ready'), 'test@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Confirm', exact: true }))
  expect(await screen.findByText('Email saved')).toBeInTheDocument()
  expect(screen.queryByText(/preview/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Back', exact: true }).closest('.waiting-actions')).not.toBeNull()
  expect(execute.mock.calls.some(([operation]) => operation === 'setup.manual')).toBe(false)
  expect(screen.getByLabelText('Download status').closest('.workspace-status-header')).not.toBeNull()
  await userEvent.click(screen.getByRole('button', { name: "I can't wait - take me to the control panel" }))
  expect(execute).toHaveBeenCalledWith('setup.manual')
  expect(onDestination).toHaveBeenCalledWith('agents')
})
it('keeps paused download status truthful and exposes existing controls in a dismissible dialog', async () => {
  const { workspace, execute } = workspaceFixture(
    {},
    { setups: [{ id: 'job', stage: 'paused', plan: { model_id: 'Qwen', total_download_bytes: 100 } }] }
  )
  render(<FloatingDownloads workspace={workspace} />)
  expect(screen.getByText('paused')).toBeInTheDocument()
  expect(screen.getByText('Open Downloads to resume')).toBeInTheDocument()
  expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'View downloads' }))
  expect(screen.getByRole('dialog', { name: 'Downloads' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalled()
})

it('validates and confirms email locally, exposing pending and editable confirmed states', async () => {
  vi.useFakeTimers()
  try {
    const { workspace, execute } = workspaceFixture()
    const view = render(<WaitingSetup workspace={workspace} onBack={vi.fn()} onContinue={vi.fn()} />)
    const input = screen.getByLabelText('Email me when it is ready')
    const confirm = screen.getByRole('button', { name: 'Confirm', exact: true })
    expect(confirm).toBeDisabled()
    expect(input.nextElementSibling).toBe(confirm)
    fireEvent.change(input, { target: { value: 'invalid' } })
    fireEvent.click(confirm)
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: 'person@example.com' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(confirm)
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true')
    expect(input).toHaveAttribute('readonly')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.getByText('Email saved')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmed' })).toBeDisabled()
    fireEvent.change(input, { target: { value: 'other@example.com' } })
    expect(screen.queryByText('Email saved')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled()
    expect(execute).not.toHaveBeenCalled()
    view.unmount()
  } finally {
    vi.useRealTimers()
  }
})
