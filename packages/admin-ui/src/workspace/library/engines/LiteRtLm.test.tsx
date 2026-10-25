/** LiteRT-LM in the admin (spec litert-lm-server, «LiteRT-LM в TUI и admin»). */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { LiteRtAcceleratorsView } from '@contract'
import { enginesList, snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from '../catalog/Catalog'
import { LiteRtLm } from './LiteRtLm'
import { jobOperations, loadTarget } from '../downloads/download-data'

const OPENVINO = {
  name: 'openvino',
  device: 'npu',
  version: '2026.4.1',
  size_bytes: 85 * 1024 ** 2,
  prepared: false,
}
const view = (over: Partial<LiteRtAcceleratorsView> = {}): LiteRtAcceleratorsView => ({
  installed: true,
  build: '0.18.1/win-x64',
  npu: 'intel-lnl',
  accelerators: [OPENVINO],
  error: null,
  preparing: false,
  last_result: null,
  last_error: null,
  steps: [],
  ...over,
})
const LINUX = view({ build: '0.18.1/linux-x64', npu: null, accelerators: [] })
const variant = (id: string, backend: string, verdict: string) => ({
  id,
  backend,
  ...(backend === 'npu' ? { npu: 'intel-lnl' } : {}),
  file: { path: `${id}.litertlm`, size: 2 * 1024 ** 3, sha256: 'a'.repeat(64) },
  verdict: { verdict, reason: verdict === 'ok' ? null : 'openvino is not prepared' },
})
const SEARCH = {
  platform: 'linux-x64',
  huggingface_unavailable: false,
  models: [
    {
      origin: 'curated',
      model_id: 'gemma-4-e4b',
      name: 'Gemma 4 E4B',
      unverified: false,
      gated: false,
      default_variant: 'gemma-4-e4b-gpu',
      variants: [variant('gemma-4-e4b-gpu', 'gpu', 'ok'), variant('gemma-4-e4b-cpu', 'cpu', 'ok')],
    },
    {
      origin: 'huggingface',
      model_id: 'litert-community/gemma-4-E2B-it-litert-lm',
      name: 'gemma-4-E2B-it-litert-lm',
      unverified: true,
      gated: false,
      default_variant: 'gemma-4-e2b-it-gpu',
      variants: [
        variant('gemma-4-e2b-it-gpu', 'gpu', 'ok'),
        variant('gemma-4-e2b-it-npu-intel-lnl', 'npu', 'accelerator-not-prepared'),
      ],
    },
  ],
}

describe('LiteRT-LM in the admin', () => {
  it('says a Linux host has nothing to prepare, and offers no Prepare', async () => {
    const { workspace } = workspaceFixture({ 'litert.accelerators': LINUX })
    render(<LiteRtLm workspace={workspace} onClose={() => {}} />)
    expect(await screen.findByText(/Nothing to prepare/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Prepare/ })).toBeNull()
  })

  it('prepares openvino on an Intel NPU and shows its progress', async () => {
    let current = view()
    const { workspace, execute } = workspaceFixture({
      'litert.accelerators': () => current,
      'litert.prepare': () => (current = view({ preparing: true })),
    })
    const ui = render(<LiteRtLm workspace={workspace} onClose={() => {}} />)
    expect(await screen.findByText(/openvino 2026\.4\.1 .*not prepared/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Prepare openvino' }))
    expect(execute).toHaveBeenCalledWith('litert.prepare', { accelerators: ['openvino'] })
    current = view({
      preparing: true,
      steps: [{ accelerator: 'openvino', stage: 'downloading', fraction: 0.5 }],
    })
    workspace.snapshot = snapshotFixture({ captured_at: 2 })
    await act(async () => ui.rerender(<LiteRtLm workspace={{ ...workspace }} onClose={() => {}} />))
    expect(await screen.findByText('openvino: downloading 50%')).toBeInTheDocument()
  })

  it('installs LiteRT-LM, preparing openvino after it only where the core offers it', async () => {
    let linux = { ...LINUX, installed: false, build: null }
    const first = workspaceFixture({
      'litert.accelerators': () => linux,
      'engines.install': () => (linux = LINUX),
    })
    render(<LiteRtLm workspace={first.workspace} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install LiteRT-LM' }))
    expect(first.execute).toHaveBeenCalledWith('engines.install', { engine: 'litert-lm' })
    expect(first.execute).not.toHaveBeenCalledWith('litert.prepare', expect.anything())
  })

  it('lists conf’s and Hugging Face’s models in the catalog’s LiteRT-LM format, with variants and verdicts', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'litert-lm']),
      'models.search': SEARCH,
      'litert.accelerators': LINUX,
      'models.installed': [],
      'artifacts.list': [],
      'models.catalog': [],
    })
    render(<Catalog workspace={workspace} openCommand={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const formats = within(screen.getByText('Format', { selector: 'legend' }).parentElement!)
    await userEvent.click(await formats.findByRole('radio', { name: 'LiteRT-LM', exact: true }))
    await userEvent.keyboard('{Escape}')
    expect(execute).toHaveBeenCalledWith('models.search', { engine: 'litert-lm', query: '' })
    expect(await screen.findByText('Gemma 4 E4B', { selector: 'strong' })).toBeInTheDocument()
    await userEvent.click(screen.getByText('gemma-4-E2B-it-litert-lm', { selector: 'strong' }))
    expect(screen.getByText('A Hugging Face model: not verified by Atomic Chat.')).toBeInTheDocument()
    const options = within(screen.getByRole('combobox', { name: 'Variant' }))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual([
      expect.stringMatching(/GPU .* ok/),
      expect.stringMatching(/NPU intel-lnl .* accelerator-not-prepared/),
    ])
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Variant' }),
      'gemma-4-e2b-it-npu-intel-lnl'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Prepare accelerator' }))
    expect(await screen.findByRole('dialog', { name: 'LiteRT-LM' })).toBeInTheDocument()
  })

  it('opens inside the engine’s settings, and its build check never installs around openvino', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'litert-lm']),
      'litert.accelerators': LINUX,
      'settings.get': { revision: 1, values: {} },
      'settings.schema': { descriptors: [] },
      'models.installed': [],
      'artifacts.list': [],
    })
    render(<Catalog workspace={workspace} openCommand={() => {}} section="engines" />)
    await userEvent.click((await screen.findAllByRole('button', { name: 'Engine settings' }))[1]!)
    const settings = within(await screen.findByRole('dialog', { name: 'litert-lm settings' }))
    expect(await settings.findByRole('region', { name: 'LiteRT-LM' })).toBeInTheDocument()
    expect(await settings.findByText(/Nothing to prepare/)).toBeInTheDocument()
    expect(settings.queryByRole('button', { name: 'Install latest build' })).toBeNull()
    expect(execute).not.toHaveBeenCalledWith('engines.enqueue', expect.anything())
  })

  it('resumes, cancels and loads a LiteRT-LM download by its own operations', () => {
    const job = { kind: 'litert-model', plan: { digest: 'pd', variant_id: 'gemma-4-e4b-gpu' } }
    expect(jobOperations(job, 'l1', false)).toEqual({
      resume: ['litert.install', { request_id: 'l1', plan_digest: 'pd' }],
      cancel: ['litert.cancel', { id: 'l1' }],
    })
    expect(loadTarget(job)).toEqual({ provider: 'litert-lm', model_id: 'gemma-4-e4b-gpu' })
  })
})
