/** Foundry Local in the admin (spec foundry-local-server, «Подготовка NPU из admin»). */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { FoundryAcceleratorsView } from '@contract'
import { enginesList, snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'
import { FoundryLocal } from './FoundryLocal'

const NPU = {
  name: 'OpenVINOExecutionProvider',
  execution_provider: 'openvino',
  device: 'npu',
  prepared: false,
}
const view = (over: Partial<FoundryAcceleratorsView> = {}) =>
  ({
    installed: true,
    build: 'v2.1.0/win-x64',
    version: '2.1.0',
    c_api_version: 2,
    probed_at: 1,
    accelerators: [NPU],
    error: null,
    preparing: false,
    last_result: null,
    last_error: null,
    steps: [],
    ...over,
  }) as FoundryAcceleratorsView

describe('Foundry Local in the admin', () => {
  it('prepares the NPU accelerator, shows its progress, then shows it prepared', async () => {
    let current = view()
    const { workspace, execute } = workspaceFixture({
      'foundry.accelerators': () => current,
      'foundry.prepare': () => (current = view({ preparing: true })),
    })
    const ui = render(<FoundryLocal workspace={workspace} onClose={() => {}} />)
    expect(await screen.findByText('OpenVINO NPU: not prepared', { exact: false })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Prepare OpenVINO NPU' }))
    expect(execute).toHaveBeenCalledWith('foundry.prepare', { accelerators: ['OpenVINOExecutionProvider'] })
    current = view({
      preparing: true,
      steps: [{ accelerator: NPU.name, stage: 'downloading', fraction: 0.5 }] as never,
    })
    workspace.snapshot = snapshotFixture({ captured_at: 2 })
    await act(async () => ui.rerender(<FoundryLocal workspace={{ ...workspace }} onClose={() => {}} />))
    expect(await screen.findByText(`${NPU.name}: downloading 50%`)).toBeInTheDocument()
    current = view({ accelerators: [{ ...NPU, prepared: true }] })
    workspace.snapshot = snapshotFixture({ captured_at: 3 })
    await act(async () => ui.rerender(<FoundryLocal workspace={{ ...workspace }} onClose={() => {}} />))
    expect(await screen.findByText('OpenVINO NPU: prepared')).toBeInTheDocument()
  })

  it('installs Foundry Local when it is absent, then prepares its accelerators', async () => {
    const { workspace, execute } = workspaceFixture({
      'foundry.accelerators': view({ installed: false, accelerators: [] }),
      'foundry.prepare': view({ preparing: true }),
    })
    render(<FoundryLocal workspace={workspace} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install Foundry Local' }))
    expect(execute).toHaveBeenCalledWith('engines.install', { engine: 'foundry-local' })
    expect(execute).toHaveBeenCalledWith('foundry.prepare', {})
  })

  it('updates the build and prepares the accelerators after it', async () => {
    const { workspace, execute } = workspaceFixture({
      'foundry.accelerators': view(),
      'foundry.prepare': view({ preparing: true }),
    })
    render(<FoundryLocal workspace={workspace} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update build' }))
    expect(execute).toHaveBeenCalledWith('engines.install', { engine: 'foundry-local' })
    expect(execute).toHaveBeenCalledWith('foundry.prepare', {})
  })

  it('opens builds, accelerators and settings together from the Engines tab', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'foundry-local']),
      'foundry.accelerators': view(),
      'models.installed': [],
      'artifacts.list': [],
    })
    render(<Catalog workspace={workspace} openCommand={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Inference engines' }))
    await userEvent.click((await screen.findAllByRole('button', { name: 'Engine settings' })).at(-1)!)
    expect(await screen.findByRole('dialog', { name: 'foundry-local settings' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Foundry Local' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeInTheDocument()
    expect(execute).not.toHaveBeenCalledWith('engines.install', { engine: 'foundry-local' })
  })
})
