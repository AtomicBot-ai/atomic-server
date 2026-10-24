/** Loads in the admin: stage and time, cancel, the log after a failure («Загрузка в admin»). */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { Cockpit } from '../Cockpit'
import { ChatModelPicker } from '../chat/ChatModelPicker'
import { workspaceApi } from '../workspace-api'
import { InstalledModels } from './InstalledModels'

const MODEL = 'nvidia/Qwen3-8B-NVFP4'
const row = {
  id: MODEL,
  name: MODEL,
  provider: 'tensorrt-llm',
  providers: ['tensorrt-llm'],
  store: 'managed',
}
const loading = (stage: string, elapsed_ms: number) =>
  snapshotFixture({
    loads: [
      {
        provider: 'tensorrt-llm',
        model_id: MODEL,
        generation: 'g',
        stage: stage as never,
        elapsed_ms,
        at: Date.now(),
      },
    ],
  })
afterEach(() => vi.restoreAllMocks())

describe('a managed load in the admin', () => {
  it('shows the stage with its time on the model’s row, then the next one, and cancels it', async () => {
    const { workspace, execute } = workspaceFixture({})
    workspace.snapshot = loading('starting-container', 2000)
    const ui = render(
      <InstalledModels
        workspace={workspace}
        installed={[row]}
        loading={false}
        openCommand={() => {}}
        browse={() => {}}
      />
    )
    expect(screen.getByText(/Starting the container \(\d+s\)/)).toBeInTheDocument()
    workspace.snapshot = loading('initializing-engine', 41000)
    ui.rerender(
      <InstalledModels
        workspace={{ ...workspace }}
        installed={[row]}
        loading={false}
        openCommand={() => {}}
        browse={() => {}}
      />
    )
    expect(screen.getByText(/Initializing the engine \(4\ds\)/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel loading' }))
    expect(execute).toHaveBeenCalledWith('models.cancel', { provider: 'tensorrt-llm', model_id: MODEL })
  })

  it('shows a failed load’s error and the last attempt’s log', async () => {
    const { workspace, execute } = workspaceFixture({
      'models.load': () => {
        throw new Error('The container exited during initialization.')
      },
      'models.logs': 'line 1\nCUDA error: out of memory\n',
    })
    render(
      <InstalledModels
        workspace={workspace}
        installed={[row]}
        loading={false}
        openCommand={() => {}}
        browse={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
    expect(await screen.findByText('The container exited during initialization.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View log' }))
    expect(execute).toHaveBeenCalledWith('models.logs', { provider: 'tensorrt-llm', model_id: MODEL })
    expect(await screen.findByText(/CUDA error: out of memory/)).toBeInTheDocument()
  })

  it('shows loads in progress in the Cockpit', () => {
    const { workspace } = workspaceFixture({})
    workspace.snapshot = loading('starting-container', 2000)
    render(<Cockpit workspace={workspace} navigate={() => {}} />)
    expect(screen.getByText(/Starting the container/)).toBeInTheDocument()
  })

  it('loads an installed model with the provider chosen in the chat picker', async () => {
    const execute = vi
      .spyOn(workspaceApi, 'execute')
      .mockImplementation(async (name: string) =>
        name === 'models.installed' ? [{ ...row, providers: ['vllm', 'tensorrt-llm'] }] : {}
      )
    render(
      <ChatModelPicker
        models={[]}
        selected=""
        setSelected={() => {}}
        preferences={{ favorites: [], rawNames: false } as never}
        save={() => {}}
        disabled={false}
        onCatalog={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Choose chat model' }))
    const select = await screen.findByLabelText('Installed model and engine')
    await waitFor(() => expect(select).toHaveTextContent('tensorrt-llm'))
    await userEvent.selectOptions(select, `tensorrt-llm|${MODEL}`)
    await userEvent.click(screen.getByRole('button', { name: 'Load with this engine' }))
    expect(execute).toHaveBeenCalledWith('models.load', { provider: 'tensorrt-llm', model_id: MODEL })
  })
})
