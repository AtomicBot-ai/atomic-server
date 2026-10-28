import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ServerControlPanel } from './ServerControlPanel'

// The API serves without a model: Start starts it, and the pending download is a hint, not a gate.
it('explains a pending download when Start is clicked, starts the API, and redirects nowhere', async () => {
  const { workspace, execute } = workspaceFixture({})
  workspace.snapshot!.api.running = false
  workspace.snapshot!.setups = [{ id: 'qwen', stage: 'downloading_model', plan: { model_id: 'qwen' } }]
  const acquire = vi.fn()
  window.addEventListener('atomic:acquire', acquire)
  try {
    const view = render(<ServerControlPanel workspace={workspace} selectSection={vi.fn()} />)
    const start = screen.getByRole('button', { name: 'Start API' })
    expect(start).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await userEvent.click(start)
    expect(screen.getByRole('status')).toHaveTextContent('The model is downloading. Wait until it is ready.')
    expect(execute).toHaveBeenCalledWith('api.start')
    expect(acquire).not.toHaveBeenCalled()
    workspace.snapshot!.services = [
      { id: 'q', model: 'qwen', provider: 'llamacpp-upstream', kind: 'chat', state: 'ready', details: {} },
    ]
    view.rerender(<ServerControlPanel workspace={workspace} selectSection={vi.fn()} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await userEvent.click(start)
    expect(execute).toHaveBeenCalledWith('api.start')
  } finally {
    window.removeEventListener('atomic:acquire', acquire)
  }
})
