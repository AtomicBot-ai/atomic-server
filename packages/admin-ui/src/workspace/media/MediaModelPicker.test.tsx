import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { refreshSharedReads } from '../watch-shared-read'
import { MediaModelPicker } from './MediaModelPicker'

it.each(['audio', 'image', 'video'])(
  'shows a completed %s download without closing the picker',
  async (task) => {
    let ready = false
    const { workspace } = workspaceFixture({
      'artifacts.list': () => [
        {
          id: 'new',
          stage: ready ? 'ready' : 'downloading',
          plan: { category: task, model_id: 'new-model', name: 'New model' },
        },
        { id: 'other', stage: 'ready', plan: { category: 'text', name: 'Text model' } },
      ],
    })
    const onClose = vi.fn()
    render(<MediaModelPicker workspace={workspace} task={task} onClose={onClose} onCatalog={vi.fn()} />)
    expect(await screen.findByText(`No ${task} models downloaded.`)).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    ready = true
    await act(async () => refreshSharedReads())
    expect(await screen.findByText('New model')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load model' })).toBeEnabled()
    expect(screen.queryByText('Text model')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(onClose).not.toHaveBeenCalled()
  }
)
