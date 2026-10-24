import { expect, it, vi } from 'vitest'
import {
  WORKSPACE_NAVIGATION,
  SERVER_SECTIONS,
  PLAYGROUND_TASKS,
  LIBRARY_SECTIONS,
  SETTINGS_SECTIONS,
} from '../../contract/index.js'
import { SERVER_SIDEBAR } from './sidebar.js'
import { createWorkspace, PAGES } from './state.js'
import { workspaceFrame } from './frame.js'
import { activate } from './actions.js'
import { operationChoices } from './operations/operation-model.js'
import { playgroundTask, serverSection, workspacePage } from './navigation.js'
import type { ActionContext } from './actions.js'
import type { WorkspaceController } from './controller.js'

function fixture() {
  let state = { ...createWorkspace('chat'), setupComplete: true }
  const execute = vi.fn(async () => ({}))
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      runtime: { execute, snapshot: async () => state.workspace },
      installed: async () => [],
      models: async () => [],
    } as unknown as WorkspaceController,
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
  }
  return { ctx, execute }
}
it('uses a rail and keeps contextual desktop navigation available inside detail views', () => {
  expect(PAGES.map((v) => v.name)).toEqual(WORKSPACE_NAVIGATION.map((v) => v.label))
  for (const page of ['server', 'requests', 'keys'] as const) {
    const state = { ...createWorkspace(page), operationReturn: 'logs' as const }
    const frame = workspaceFrame(state, 100, 30, 0)
    for (const section of SERVER_SIDEBAR)
      expect(frame.targets.some((v) => v.id === `server-section:${section.id}`)).toBe(true)
    expect(workspacePage(state)).toBe('server')
  }
  for (const page of ['access', 'settings', 'logs', 'checks', 'tools'] as const) {
    const state = { ...createWorkspace(page), operationReturn: 'logs' as const }
    const frame = workspaceFrame(state, 80, 30, 0)
    for (const section of SETTINGS_SECTIONS)
      expect(frame.targets.some((v) => v.id === `settings-section:${section.id}`)).toBe(true)
    expect(workspacePage(state)).toBe('access')
  }
})
it('opens task-specific media forms directly from mouse and keyboard targets', async () => {
  const { ctx, execute } = fixture()
  for (const task of PLAYGROUND_TASKS.filter((v) => v.id !== 'chat')) {
    await activate(`playground-task:${task.id}`, ctx)
    expect(ctx.get()).toMatchObject({ page: 'tools', operationReturn: 'chat', overlay: null })
    expect(playgroundTask(ctx.get())).toBe(task.id)
    expect(operationChoices(ctx.get()).every((v) => v.name.startsWith(`media.${task.id}.`))).toBe(true)
    const frame = workspaceFrame(ctx.get(), 80, 24, 0)
    for (const other of PLAYGROUND_TASKS)
      expect(frame.targets.some((v) => v.id === `playground-task:${other.id}`)).toBe(true)
    expect(frame.targets.some((v) => v.id === 'operation-field:request.workflow')).toBe(true)
    expect(frame.targets.some((v) => v.id === 'operation-select' || v.id === 'operation-output')).toBe(false)
  }
  expect(execute).toHaveBeenCalledWith('media.image.gallery')
  expect(execute).toHaveBeenCalledWith('media.video.gallery')
  await activate('playground-task:chat', ctx)
  expect(ctx.get()).toMatchObject({ page: 'chat', focus: 'composer' })
})
it('routes each server section and library child back to its shared parent', async () => {
  const { ctx } = fixture()
  for (const section of SERVER_SECTIONS) {
    await activate(`server-section:${section.id}`, ctx)
    expect(serverSection(ctx.get())).toBe(section.id)
  }
  await activate('settings-section:admin', ctx)
  await activate('open-operation:hardware.info', ctx)
  expect(workspacePage(ctx.get())).toBe('access')
  await activate('settings-section:admin', ctx)
  await activate('settings-expand:engines', ctx)
  await activate('open-operation:settings.get', ctx)
  expect(workspacePage(ctx.get())).toBe('access')
  expect(ctx.get().settingsGroup).toBe('admin')
  expect(ctx.get().settingsExpanded).toContain('engines')
  ctx.update((s) => ({ ...s, page: 'tools', operationReturn: 'models' }))
  const frame = workspaceFrame(ctx.get(), 80, 24, 0)
  for (const section of LIBRARY_SECTIONS)
    expect(frame.targets.some((v) => v.id === `library:${section.id}`)).toBe(true)
  await activate('library:installed', ctx)
  expect(ctx.get()).toMatchObject({ page: 'models', libraryView: 'installed', overlay: null })
})

it('keeps the first-connection card in bounds without extra specialist task links', () => {
  const state = { ...createWorkspace('server'), serverView: 'connect' }
  state.workspace = {
    eye: 'ready',
    api: { running: true, endpoint: 'http://localhost:1337/v1' },
    services: [{ id: 'embedding', kind: 'embedding', model: 'search', state: 'loaded' }],
  } as NonNullable<typeof state.workspace>
  for (const [width, height] of [
    [54, 24],
    [80, 24],
    [120, 36],
  ]) {
    const frame = workspaceFrame(state, width!, height!, 0)
    expect(frame.targets.some((t) => t.id === 'open-operation:media.embedding.run')).toBe(false)
    expect(frame.targets.some((t) => t.id === 'guide-open')).toBe(true)
    for (const target of frame.targets) {
      expect(target.x + target.width).toBeLessThanOrEqual(width!)
      expect(target.y + target.height).toBeLessThanOrEqual(height!)
    }
  }
})
