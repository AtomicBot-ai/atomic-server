/** The managed engine modal of the admin's Engines tab (spec managed-engines-server, design D17). */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ManagedEngineState, WorkspaceSnapshot } from '@contract'
import { snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import {
  DIGEST_A,
  DIGEST_B,
  installation,
  operation,
  plan,
} from '../../../../../test/helpers/managed-fixtures'
import { EngineSetup } from './EngineSetup'
import { Catalog } from './Catalog'
import { enginesList } from '@/test/workspace-fixture'

const state = (over: Partial<ManagedEngineState> = {}): ManagedEngineState => ({
  engine: 'vllm',
  environment_id: 'default',
  executor: 'linux-docker',
  plan: plan('vllm'),
  plan_error: null,
  notices: [],
  installation: null,
  operation: null,
  other_operation: null,
  failed: null,
  models_kept_for: [],
  update: null,
  ...over,
})

describe('the managed engine modal', () => {
  it('installs vLLM: the plan, Agree with its digest, phases and image bytes, then ready', async () => {
    const { workspace, execute } = workspaceFixture({ 'engines.plan': state(), 'engines.operate': {} })
    const view = render(<EngineSetup workspace={workspace} engine="vllm" onClose={() => {}} />)
    expect(await screen.findByText(DIGEST_A, { exact: false })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Agree and install' }))
    expect(execute).toHaveBeenCalledWith('engines.operate', {
      engine: 'vllm',
      kind: 'setup',
      request_id: expect.stringMatching(/^admin-/),
      approved_plan_digest: DIGEST_A,
    })
    const pulling = operation('vllm', 'pulling-image', {
      progress: { unit: 'bytes', completed: 512 * 1024 ** 2, total: 1024 ** 3 } as never,
    })
    workspace.snapshot = snapshotFixture({
      engines: [{ engine: 'vllm', installation: null, operation: pulling }],
    })
    view.rerender(<EngineSetup workspace={{ ...workspace }} engine="vllm" onClose={() => {}} />)
    expect(await screen.findByText(/Downloading the engine image/)).toBeInTheDocument()
    expect(screen.getByText(/512\.0 MiB of 1\.0 GiB/)).toBeInTheDocument()
    workspace.snapshot = snapshotFixture({
      engines: [{ engine: 'vllm', installation: installation('vllm'), operation: null }],
    })
    view.rerender(<EngineSetup workspace={{ ...workspace }} engine="vllm" onClose={() => {}} />)
    expect(await screen.findByText(/installed \(vllm-2026\.10\.1\)/)).toBeInTheDocument()
  })

  it('names the other engine whose operation runs first, and its phase', async () => {
    const { workspace } = workspaceFixture({ 'engines.plan': state() })
    workspace.snapshot = snapshotFixture({
      engines: [{ engine: 'sglang', installation: null, operation: operation('sglang', 'pulling-image') }],
    } as Partial<WorkspaceSnapshot>)
    render(<EngineSetup workspace={workspace} engine="vllm" onClose={() => {}} />)
    expect(await screen.findByText(/The setup of sglang runs first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agree and install' })).not.toBeInTheDocument()
  })

  it('shows why a failed setup failed, and no Retry while another engine’s setup runs', async () => {
    const failed = operation('vllm', 'failed', {
      error: {
        code: 'IO_ERROR',
        message: 'Docker image pull failed with status 500.',
        details: '{"message":"unexpected status from HEAD request to https://nvcr.io/v2/: 403 Forbidden"}',
      } as never,
    })
    const { workspace } = workspaceFixture({ 'engines.plan': state({ failed }) })
    workspace.snapshot = snapshotFixture({
      engines: [
        { engine: 'vllm', installation: null, operation: null },
        { engine: 'sglang', installation: null, operation: operation('sglang', 'pulling-image') },
      ],
    } as Partial<WorkspaceSnapshot>)
    render(<EngineSetup workspace={workspace} engine="vllm" onClose={() => {}} />)
    expect(await screen.findByText(/nvcr\.io\/v2\/: 403 Forbidden/)).toBeInTheDocument()
    expect(screen.getByText(/The setup of sglang runs first/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('asks again when the plan changed before consent, and approves only the new one', async () => {
    let digest: string = DIGEST_A
    const { workspace, execute } = workspaceFixture({
      'engines.plan': () => state({ plan: plan('vllm', { plan_digest: digest as never }) }),
      'engines.resume': {},
    })
    const view = render(<EngineSetup workspace={workspace} engine="vllm" onClose={() => {}} />)
    await screen.findByText(DIGEST_A, { exact: false })
    // The host changed: the core now waits for consent to another plan.
    digest = DIGEST_B
    const asking = operation('vllm', 'awaiting-consent', { plan_digest: DIGEST_B as never })
    workspace.snapshot = snapshotFixture({
      engines: [{ engine: 'vllm', installation: null, operation: asking }],
    } as Partial<WorkspaceSnapshot>)
    await act(async () =>
      view.rerender(<EngineSetup workspace={{ ...workspace }} engine="vllm" onClose={() => {}} />)
    )
    expect(await screen.findByText(DIGEST_B, { exact: false })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Agree' }))
    expect(execute).toHaveBeenCalledWith('engines.resume', {
      operation_id: asking.operation_id,
      approved_plan_digest: DIGEST_B,
    })
    expect(execute).not.toHaveBeenCalledWith(
      'engines.resume',
      expect.objectContaining({ approved_plan_digest: DIGEST_A })
    )
  })

  it('shows the privileged step’s command to copy, and removes the engine keeping its models', async () => {
    const waiting = operation('vllm', 'preparing-host', { pending_host_step: { step_id: 's1' } as never })
    const { workspace, execute } = workspaceFixture(
      { 'engines.plan': state({ installation: installation('vllm') }), 'engines.operate': {} },
      {
        engines: [{ engine: 'vllm', installation: null, operation: waiting }],
        host_steps: [
          {
            step_id: 's1',
            operation_id: waiting.operation_id,
            instructions: 'sudo atc host-step exec /r/s1.json',
            updated_at: 1,
          },
        ],
      }
    )
    const view = render(<EngineSetup workspace={workspace} engine="vllm" onClose={() => {}} />)
    expect(await screen.findByText('sudo atc host-step exec /r/s1.json')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy/ })).toBeInTheDocument()
    workspace.snapshot = snapshotFixture({
      engines: [{ engine: 'vllm', installation: installation('vllm'), operation: null }],
    })
    view.rerender(<EngineSetup workspace={{ ...workspace }} engine="vllm" onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove…' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Keep models' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('engines.operate', {
        engine: 'vllm',
        kind: 'remove',
        request_id: expect.stringMatching(/^admin-/),
        retain_models: true,
      })
    )
  })

  it('shows the new release’s plan before an update, and reinstalls only after Agree', async () => {
    const offer = {
      engine: 'vllm',
      status: 'update',
      from: 'vllm-1',
      target: 'vllm-2',
      state: state({ plan: plan('vllm', { plan_digest: DIGEST_B as never }) }),
    }
    const { workspace, execute } = workspaceFixture(
      {
        'engines.plan': state({
          installation: installation('vllm'),
          update: {
            needed: true,
            target: { version: 'vllm-2', variant: 'linux/amd64' },
            apply: 'reinstall',
          } as never,
        }),
        'engines.install': (i: Record<string, unknown>) =>
          (i['request'] as Record<string, unknown>)['approved_update'] ? { status: 'updating' } : offer,
      },
      { engines: [{ engine: 'vllm', installation: installation('vllm'), operation: null }] }
    )
    render(<EngineSetup workspace={workspace} engine="vllm" onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update' }))
    expect(await screen.findByText(/vllm-1 → vllm-2/)).toBeInTheDocument()
    expect(screen.getByText(DIGEST_B, { exact: false })).toBeInTheDocument()
    expect(execute.mock.calls.filter(([n]) => n === 'engines.install')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Agree and update' }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('engines.install', {
        engine: 'vllm',
        request: { request_id: expect.stringMatching(/^admin-/), approved_update: 'vllm-2' },
      })
    )
  })

  it('offers no Agree and update for a new release this machine cannot run', async () => {
    const offer = {
      engine: 'vllm',
      status: 'update',
      from: 'vllm-1',
      target: 'vllm-2',
      state: state({ plan: plan('vllm', { availability: 'prerequisite-blocked' }) }),
    }
    const { workspace } = workspaceFixture(
      {
        'engines.plan': state({
          installation: installation('vllm'),
          update: { needed: true, target: { version: 'vllm-2' }, apply: 'reinstall' } as never,
        }),
        'engines.install': offer,
      },
      { engines: [{ engine: 'vllm', installation: installation('vllm'), operation: null }] }
    )
    render(<EngineSetup workspace={workspace} engine="vllm" onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update' }))
    expect(await screen.findByText(/vllm-1 → vllm-2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Agree and update' })).not.toBeInTheDocument()
  })

  it('opens the modal from the Engines tab instead of installing at once', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'vllm'], ['llamacpp-upstream']),
      'engines.plan': state(),
      'models.installed': [],
      'artifacts.list': [],
    })
    render(<Catalog workspace={workspace} openCommand={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Inference engines' }))
    const install = await screen.findAllByRole('button', { name: 'Engine settings' })
    await userEvent.click(install.at(-1)!)
    expect(await screen.findByRole('dialog', { name: 'vllm settings' })).toBeInTheDocument()
    expect(execute).not.toHaveBeenCalledWith('engines.install', expect.anything())
  })
})
