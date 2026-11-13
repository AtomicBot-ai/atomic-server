import { expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import { FIELDS } from '../../../config/index.js'
import { FAKE_HARDWARE } from '../../../../test/helpers/fake-core-link.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { hardwareRows } from './hardware-panel.js'
import { settingsEntries } from './settings-model.js'
import { SETTINGS_SECTIONS, SETTINGS_WORKSPACE_SECTIONS } from '../../../contract/index.js'
function fixture(group = 'api') {
  let state = { ...createWorkspace('access'), setupComplete: true, settingsGroup: group }
  state.base.config.rows = FIELDS.map((f) => ({
    path: f.path,
    type: f.type,
    value: String(f.default ?? ''),
    description: f.description,
    source: 'default' as const,
    values: f.values,
  }))
  const execute = vi.fn(async () => ({}))
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    copy: vi.fn(),
    cancel: vi.fn(),
    send: vi.fn(),
    controller: { runtime: { execute }, run: vi.fn() } as unknown as WorkspaceController,
  }
  return { ctx, execute }
}
it('starts General with About and common controls, keeping host and port in Advanced settings', async () => {
  const { ctx } = fixture('admin')
  ctx.update((s) => ({ ...s, workspace: { core: { version: '0.19.0' } } as never }))
  await activate('settings-section:admin', ctx)
  expect(ctx.get().focus).toBe('setting:admin.openOnStart')
  const ids = settingsEntries(ctx.get()).map((entry) => entry.id)
  expect(ids.slice(0, 4)).toEqual([
    'settings-about',
    'setting:admin.openOnStart',
    'setting:admin.autoStart',
    'settings-expand:admin-advanced',
  ])
  expect(ids).not.toContain('setting:admin.host')
  expect(ids).not.toContain('setting:admin.port')
  const frame = workspaceFrame(ctx.get(), 120, 36, 0)
  const content = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(content).toContain('About')
  expect(content).toContain('Core version')
  expect(content).toContain('0.19.0')
  await activate('settings-expand:admin-advanced', ctx)
  expect(settingsEntries(ctx.get()).map((entry) => entry.id)).toContain('setting:admin.port')
  await activate('setting:admin.port', ctx)
  ctx.update((s) => ({ ...s, editValue: '1444' }))
  await activate('save-edit', ctx)
  await activate('settings-expand:admin-advanced', ctx)
  expect(ctx.get().configDraft).toEqual({ 'admin.port': '1444' })
})
it('keeps backend configuration inside General and opens the same desktop settings routes', async () => {
  const { ctx, execute } = fixture('admin')
  const before = settingsEntries(ctx.get())
  expect(before.some((entry) => entry.id === 'setting:api.port')).toBe(false)
  await activate('settings-expand:api', ctx)
  expect(settingsEntries(ctx.get()).some((entry) => entry.id === 'setting:api.port')).toBe(true)
  await activate('setting:api.port', ctx)
  ctx.update((s) => ({ ...s, editValue: '1555' }))
  await activate('save-edit', ctx)
  expect(execute).not.toHaveBeenCalled()
  for (const section of [...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS].filter(
    (entry) => entry.id !== 'hardware'
  )) {
    await activate(`settings-section:${section.id}`, ctx)
    expect(ctx.get()).toMatchObject({
      settingsGroup: section.id,
      overlay: null,
      configDraft: { 'api.port': '1555' },
    })
    const frame = workspaceFrame(ctx.get(), 120, 36, 0)
    expect(frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')).toContain(
      section.label
    )
    expect(frame.targets.some((target) => target.id === 'settings-section:api')).toBe(false)
  }
})
it.each([54, 80, 120])(
  'scrolls every setting into view with a visible focus at %s columns',
  async (width) => {
    const { ctx } = fixture()
    ctx.update((s) => ({ ...s, focus: 'setting:api.host' }))
    for (let i = 0; i < 7; i++) {
      const frame = workspaceFrame(ctx.get(), width, 24, 0)
      const target = frame.targets.find((t) => t.id === ctx.get().focus)
      expect(target).toBeDefined()
      expect(frame.cells[target!.y]![target!.x]!.color).not.toBe('#303638')
      const next = workspaceInput('', { downArrow: true } as Key, ctx.get(), frame)
      ctx.update((s) => ({ ...s, ...next.patch }))
    }
    expect(ctx.get().focus).toBe('setting:api.autoStart')
    const wheel = workspaceInput(
      '\u001b[<64;45;10M',
      {} as Key,
      ctx.get(),
      workspaceFrame(ctx.get(), width, 24, 0)
    )
    await activate(wheel.action!, ctx)
    expect(ctx.get().focus).toBe('setting:api.trustedHosts')
  }
)
it('stages enum dropdown choices and sends the selected value only on Save', async () => {
  const { ctx, execute } = fixture('log')
  await activate('setting:log.level', ctx)
  expect(ctx.get()).toMatchObject({ overlay: 'config-choice', focus: 'config-choice:1' })
  const next = workspaceInput('', { downArrow: true } as Key, ctx.get(), workspaceFrame(ctx.get(), 54, 24, 0))
  ctx.update((s) => ({ ...s, ...next.patch }))
  await activate(ctx.get().focus, ctx)
  expect(ctx.get()).toMatchObject({
    overlay: null,
    configDraft: { 'log.level': 'warn' },
    focus: 'setting:log.level',
  })
  expect(execute).not.toHaveBeenCalled()
  await activate('settings-save', ctx)
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'log.level': 'warn' } })
})
it('keeps unsaved values on failure and blocks duplicate saves while pending', async () => {
  const { ctx, execute } = fixture('telemetry')
  await activate('setting:telemetry.enabled', ctx)
  let reject!: (error: Error) => void
  execute.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail
      })
  )
  const pending = activate('settings-save', ctx)
  await vi.waitFor(() => expect(ctx.get().busy).toBe(true))
  await activate('settings-save', ctx)
  expect(execute).toHaveBeenCalledTimes(1)
  reject(new Error('Server unavailable'))
  await expect(pending).rejects.toThrow('Server unavailable')
  expect(ctx.get()).toMatchObject({ busy: false, configDraft: { 'telemetry.enabled': 'false' } })
})
it('reads hardware automatically into dedicated cards without inventing GPU facts', async () => {
  const { ctx, execute } = fixture()
  execute.mockResolvedValue(FAKE_HARDWARE)
  await activate('settings-section:hardware', ctx)
  expect(execute).toHaveBeenCalledWith('hardware.info')
  expect(ctx.get()).toMatchObject({
    page: 'tools',
    operation: 'hardware.info',
    operationReturn: 'access',
    settingsGroup: 'hardware',
  })
  expect(hardwareRows(ctx.get().operationResult).map((r) => r.title)).toEqual([
    'System',
    'Processor',
    'Graphics',
  ])
  const frame = workspaceFrame(ctx.get(), 54, 24, 0)
  const output = frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')
  expect(output).toContain('Fake CPU')
  expect(output).toContain('No GPU reported')
  expect(frame.targets.some((t) => t.id === 'operation-json')).toBe(false)
})
