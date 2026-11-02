import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ServerControlPanel } from './ServerControlPanel'

it.each([false, true])(
  'blocks API actions during a download when the old listener is running=%s',
  async (running) => {
    const { workspace, execute } = workspaceFixture({})
    workspace.snapshot!.api.running = running
    workspace.snapshot!.setups = [{ id: 'qwen', stage: 'downloading_model', plan: { model_id: 'qwen' } }]
    const acquire = vi.fn()
    window.addEventListener('atomic:acquire', acquire)
    try {
      const view = render(<ServerControlPanel workspace={workspace} selectSection={vi.fn()} />)
      const start = screen.getByRole('button', { name: 'Model is downloading...' })
      expect(start).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('button', { name: 'Stop API' })).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      await userEvent.click(start)
      expect(screen.getByRole('status')).toHaveTextContent(
        'Wait for the model to download before starting the API.'
      )
      expect(execute.mock.calls.some(([op]) => ['api.start', 'api.stop'].includes(op))).toBe(false)
      expect(acquire).not.toHaveBeenCalled()
      workspace.snapshot!.api.running = false
      workspace.snapshot!.services = [
        { id: 'q', model: 'qwen', provider: 'llamacpp-upstream', kind: 'chat', state: 'ready', details: {} },
      ]
      view.rerender(<ServerControlPanel workspace={workspace} selectSection={vi.fn()} />)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      await userEvent.click(start)
      expect(execute).toHaveBeenCalledWith('api.start', { restore_selected: true })
    } finally {
      window.removeEventListener('atomic:acquire', acquire)
    }
  }
)
