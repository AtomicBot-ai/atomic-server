import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { connectionChoices } from './connection-picker.js'

const job = {
  id: 'download',
  stage: 'downloading_model',
  plan: { model_id: 'new-model', provider: 'llamacpp-upstream', total_download_bytes: 100 },
}
function fixture() {
  let state: WorkspaceState = {
    ...createWorkspace('welcome'),
    firstRun: 'connect',
    workspace: {
      api: { port: 1337 },
      setups: [job],
      downloads: [{ taskId: 'download', transferred: 50 }],
    } as never,
  }
  const execute = vi.fn(async (name: string) => {
    if (name === 'keys.list') return [{ id: 'key' }]
    if (name === 'connection.info') return { endpoint: 'http://localhost:1777/v1' }
    if (name === 'connection.profile') return { launch_command: 'atc connect codex --model new-model' }
    return {}
  })
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    copy: vi.fn(),
    cancel: vi.fn(),
    send: vi.fn(),
    controller: {
      installed: async () => [],
      runtime: { execute },
      localEndpoint: async () => 'http://localhost:1777/v1',
    } as unknown as WorkspaceController,
  }
  return { ctx, execute }
}
const content = (s: WorkspaceState, width = 54) =>
  workspaceFrame(s, width, 24, 0)
    .cells.map((line) => line.map((c) => c.char).join(''))
    .join('\n')

it.each(['agent', 'endpoint'])(
  'holds the pending %s draft and engine until an explicit Configure action',
  async (path) => {
    const { ctx, execute } = fixture()
    if (path === 'agent') await activate('guide-agent:codex', ctx)
    else {
      await activate('guide-open', ctx)
      await activate('guide-path:endpoint', ctx)
      await activate('guide-port', ctx)
      ctx.update((s) => ({ ...s, editValue: '1777' }))
      await activate('save-edit', ctx)
      await activate('guide-next', ctx)
    }
    expect(ctx.get().connection).toMatchObject({ path, model: 'new-model', provider: 'llamacpp-upstream' })
    for (const width of [54, 80, 120]) {
      const frame = workspaceFrame(ctx.get(), width, 24, 0)
      expect(frame.targets.some((t) => t.id === 'guide-configure')).toBe(false)
      expect(frame.targets.some((t) => t.id === 'guide-game')).toBe(true)
      expect(content(ctx.get(), width)).toContain('Waiting for the model download')
    }
    await activate('guide-engine', ctx)
    expect(connectionChoices(ctx.get())).toEqual([
      { value: 'llamacpp-upstream', label: 'llama.cpp', selected: true },
    ])
    await activate('close', ctx)
    await activate('guide-configure', ctx)
    expect(execute).not.toHaveBeenCalled()
    ctx.update((s) => ({
      ...s,
      installed: [{ id: 'new-model', name: 'New model', provider: 'llamacpp-upstream' }],
      workspace: { ...s.workspace!, setups: [{ ...job, stage: 'ready' }] },
    }))
    expect(ctx.get().connection).toMatchObject({
      step: 'review',
      path,
      model: 'new-model',
      provider: 'llamacpp-upstream',
      ...(path === 'endpoint' ? { port: '1777' } : { agent: 'codex' }),
    })
    expect(workspaceFrame(ctx.get(), 54, 24, 0).targets.some((t) => t.id === 'guide-configure')).toBe(true)
    expect(execute).not.toHaveBeenCalled()
    await activate('guide-configure', ctx)
    expect(ctx.get().connection?.step).toBe('done')
    expect(execute).toHaveBeenCalledWith('models.load', {
      provider: 'llamacpp-upstream',
      model_id: 'new-model',
    })
  }
)

it('shows pause, failure and removal with recovery while retaining the chosen engine and model', async () => {
  const { ctx } = fixture()
  await activate('guide-agent:codex', ctx)
  for (const [stage, status] of [
    ['paused', 'Download paused.'],
    ['failed', 'Download failed.'],
    ['removed', 'Model is not downloaded.'],
  ]) {
    ctx.update((s) => ({
      ...s,
      workspace: { ...s.workspace!, setups: stage === 'removed' ? [] : [{ ...job, stage }] },
    }))
    expect(content(ctx.get())).toContain(status)
    expect(ctx.get().connection).toMatchObject({
      model: 'new-model',
      provider: 'llamacpp-upstream',
      agent: 'codex',
    })
    expect(workspaceFrame(ctx.get(), 54, 24, 0).targets.some((t) => t.id === 'guide-configure')).toBe(false)
  }
})
