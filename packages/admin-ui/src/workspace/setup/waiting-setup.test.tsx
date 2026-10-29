import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from './SetupWizard'
import { WaitingSetup } from './WaitingSetup'
import { FloatingDownloads } from '../library/downloads/FloatingDownloads'

it('offers a playable final wait, the model-ready email and an exit while download continues', async () => {
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
  await userEvent.click(screen.getByRole('button', { name: 'Notify me' }))
  expect(execute).toHaveBeenCalledWith('setup.reminder', { email: 'test@example.com' })
  expect(screen.getByLabelText('Email me when it is ready')).toHaveValue('')
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
  expect(screen.getByText('Paused')).toBeInTheDocument()
  expect(screen.getByText('Open Downloads to resume')).toBeInTheDocument()
  expect(screen.queryByText(/remaining/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'View downloads' }))
  expect(screen.getByRole('dialog', { name: 'Downloads' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalled()
})

const downloading = [{ setup_id: 's1', stage: 'downloading_model', plan: { model_id: 'Qwen' } }]

it('registers the address with the server, shows its refusal, then the reminder the server keeps', async () => {
  let answer: (() => void) | null = null
  const replies: Array<() => Promise<unknown>> = [
    async () => {
      throw new Error('Too many requests. Try again in an hour.')
    },
    () =>
      new Promise((resolve) => {
        answer = () => resolve(null)
      }),
  ]
  const { workspace, execute } = workspaceFixture(
    { 'setup.reminder': () => replies.shift()!() },
    { setups: downloading }
  )
  const view = render(<WaitingSetup workspace={workspace} onBack={vi.fn()} onContinue={vi.fn()} />)
  const input = screen.getByLabelText('Email me when it is ready')
  const notify = screen.getByRole('button', { name: 'Notify me' })
  expect(input).toHaveAccessibleDescription(/agree to one email when this model is ready/)
  expect(notify).toBeDisabled()
  expect(input.nextElementSibling).toBe(notify)
  fireEvent.change(input, { target: { value: 'invalid' } })
  fireEvent.click(notify)
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(execute).not.toHaveBeenCalled()

  fireEvent.change(input, { target: { value: 'person@example.com' } })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(notify)
  expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Try again in an hour.')
  expect(input).toHaveValue('person@example.com')

  fireEvent.click(notify)
  expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true')
  expect(input).toHaveAttribute('readonly')
  expect(screen.getByText('Saving your reminder…')).toBeInTheDocument()
  // The server answers once the service took the address; the snapshot then holds the reminder.
  workspace.snapshot = {
    ...workspace.snapshot!,
    reminder: { setup_id: 's1', model: 'Qwen', model_name: 'Qwen', status: 'waiting', registered_at: 1 },
  }
  await act(async () => answer!())
  expect(input).toHaveValue('')
  expect(screen.getByText(/Reminder set\. We’ll email you when the model is ready\./)).toBeInTheDocument()
  expect(execute).toHaveBeenLastCalledWith('setup.reminder', { email: 'person@example.com' })
  view.unmount()
})

it('offers no email once the model is downloaded', () => {
  const { workspace } = workspaceFixture(
    {},
    { setups: [{ setup_id: 's1', stage: 'ready', plan: { model_id: 'Qwen' } }] }
  )
  render(<WaitingSetup workspace={workspace} onBack={vi.fn()} onContinue={vi.fn()} />)
  expect(screen.getByText('Your model is downloaded. Continue to finish setup.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Email me when it is ready')).not.toBeInTheDocument()
})
