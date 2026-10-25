import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ConnectionGuide } from './ConnectionGuide'

const plan = { model_id: 'new-model', provider: 'llamacpp-upstream', total_download_bytes: 100 }
const job = { id: 'download', stage: 'downloading_model', plan }
it.each(['agent', 'endpoint'])(
  'retains the engine and %s draft until explicit configuration after download',
  async (path) => {
    let installed: unknown[] = []
    const { workspace, execute } = workspaceFixture(
      {
        'models.installed': () => installed,
        'keys.list': [{ id: 'key' }],
        'connection.info': { endpoint: 'http://127.0.0.1:1777/v1' },
        'connection.profile': { launch_command: 'atc connect codex --model new-model' },
      },
      { setups: [job], downloads: [{ taskId: 'download', transferred: 50, total: 100 }] }
    )
    const guide = (value = workspace) => (
      <ConnectionGuide
        workspace={value}
        initialAgent={path === 'agent' ? 'codex' : undefined}
        onClose={vi.fn()}
        onSettings={vi.fn()}
      />
    )
    const view = render(guide())
    if (path === 'endpoint') {
      await userEvent.click(screen.getByRole('button', { name: /Configure an endpoint/ }))
      await userEvent.clear(screen.getByLabelText('Server port'))
      await userEvent.type(screen.getByLabelText('Server port'), '1777')
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    }
    expect(screen.getByLabelText('Inference engine')).toHaveValue('llamacpp-upstream')
    expect(screen.getByLabelText('Model')).toHaveValue('new-model')
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Waiting for the model download · 50%')
    )
    expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Play while waiting' })).toBeEnabled()
    for (const [stage, status] of [
      ['paused', 'Download paused'],
      ['failed', 'Download failed'],
    ]) {
      view.rerender(
        guide({ ...workspace, snapshot: { ...workspace.snapshot!, setups: [{ ...job, stage }] } })
      )
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(status))
      expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Resume download' }))
      expect(execute).toHaveBeenCalledWith('setup.resume', { setup_id: 'download' })
    }
    installed = [{ id: 'new-model', providers: ['llamacpp-upstream'] }]
    view.rerender(
      guide({ ...workspace, snapshot: { ...workspace.snapshot!, setups: [{ ...job, stage: 'ready' }] } })
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
    expect(screen.getByLabelText('Model')).toHaveValue('new-model')
    expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
    if (path === 'endpoint') expect(screen.getByText('http://127.0.0.1:1777/v1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
    await screen.findByRole('heading', {
      name: path === 'agent' ? 'Codex CLI connection is ready' : 'Your endpoint is ready',
    })
    expect(execute).toHaveBeenCalledWith('models.load', {
      provider: 'llamacpp-upstream',
      model_id: 'new-model',
    })
  }
)

it('keeps a removed selection visible and explains how to recover instead of waiting forever', async () => {
  const { workspace } = workspaceFixture({ 'models.installed': [] }, { setups: [job] })
  const guide = (value = workspace) => (
    <ConnectionGuide workspace={value} initialAgent="codex" onClose={vi.fn()} onSettings={vi.fn()} />
  )
  const view = render(guide())
  await waitFor(() => expect(screen.getByLabelText('Inference engine')).toHaveValue('llamacpp-upstream'))
  await act(async () =>
    view.rerender(guide({ ...workspace, snapshot: { ...workspace.snapshot!, setups: [] } }))
  )
  expect(screen.getByRole('status')).toHaveTextContent('Model is not downloaded. Choose it again')
  expect(screen.getByLabelText('Model')).toHaveValue('new-model')
  expect(screen.getByLabelText('Inference engine')).toHaveValue('llamacpp-upstream')
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Play while waiting' })).not.toBeInTheDocument()
})

it('explains missing engine compatibility without offering a broken configuration', async () => {
  const { workspace, execute } = workspaceFixture({
    'models.installed': [{ id: 'unsupported', providers: [] }],
  })
  render(
    <ConnectionGuide
      workspace={workspace}
      initialAgent="codex"
      preferredModel="unsupported"
      onClose={vi.fn()}
      onSettings={vi.fn()}
    />
  )
  expect(
    await screen.findByText('No compatible inference engine. Choose a different model.')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeDisabled()
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
})

it('shows an unavailable engine error on review and keeps the selected agent and model', async () => {
  const { workspace, execute } = workspaceFixture({
    'models.installed': [{ id: 'new-model', providers: ['llamacpp-upstream'] }],
    'models.load': () => {
      throw new Error('Inference engine unavailable. Install llama.cpp and retry.')
    },
  })
  render(
    <ConnectionGuide
      workspace={workspace}
      initialAgent="codex"
      preferredModel="new-model"
      onClose={vi.fn()}
      onSettings={vi.fn()}
    />
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Inference engine unavailable. Install llama.cpp and retry.'
  )
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
  expect(screen.getByLabelText('Model')).toHaveValue('new-model')
  expect(screen.getByLabelText('Inference engine')).toHaveValue('llamacpp-upstream')
  expect(execute).not.toHaveBeenCalledWith('connection.profile', expect.anything())
  expect(execute).not.toHaveBeenCalledWith('api.start', expect.anything())
})

it('updates the optional game when ready and returns to the unchanged draft on Escape', async () => {
  let installed: unknown[] = []
  const { workspace, execute } = workspaceFixture({ 'models.installed': () => installed }, { setups: [job] })
  const close = vi.fn()
  const guide = (value = workspace) => (
    <ConnectionGuide workspace={value} initialAgent="codex" onClose={close} onSettings={vi.fn()} />
  )
  const view = render(guide())
  await userEvent.click(await screen.findByRole('button', { name: 'Play while waiting' }))
  installed = [{ id: 'new-model', providers: ['llamacpp-upstream'] }]
  view.rerender(
    guide({ ...workspace, snapshot: { ...workspace.snapshot!, setups: [{ ...job, stage: 'ready' }] } })
  )
  await waitFor(() =>
    expect(
      within(screen.getByRole('dialog', { name: 'Minesweeper' })).getByText(
        'Model ready. Configure the connection to continue.'
      )
    ).toBeInTheDocument()
  )
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Minesweeper' })).not.toBeInTheDocument()
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Connect Codex CLI' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled()
})

it('resumes the newest matching attempt instead of an earlier failed download', async () => {
  const failed = { ...job, id: 'old-failed', stage: 'failed', created_at: 10, updated_at: 20 }
  const paused = { ...job, id: 'new-paused', stage: 'paused', created_at: 30, updated_at: 40 }
  const { workspace, execute } = workspaceFixture({ 'models.installed': [] }, { setups: [failed, paused] })
  const guide = (value = workspace) => (
    <ConnectionGuide workspace={value} initialAgent="codex" onClose={vi.fn()} onSettings={vi.fn()} />
  )
  const view = render(guide())
  await userEvent.click(await screen.findByRole('button', { name: 'Resume download' }))
  expect(execute).toHaveBeenCalledWith('setup.resume', { setup_id: 'new-paused' })
  expect(execute).not.toHaveBeenCalledWith('setup.resume', { setup_id: 'old-failed' })
  await act(async () =>
    view.rerender(
      guide({
        ...workspace,
        snapshot: {
          ...workspace.snapshot!,
          setups: [failed, { ...paused, stage: 'downloading_model', updated_at: 50 }],
        },
      })
    )
  )
  expect(screen.getByRole('status')).toHaveTextContent('Waiting for the model download')
  expect(screen.queryByRole('button', { name: 'Resume download' })).not.toBeInTheDocument()
})
