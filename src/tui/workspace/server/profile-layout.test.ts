import { expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import { canvas } from '../draw/canvas.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import type { ActionContext } from '../actions.js'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '../../../contract/index.js'
import { drawProfiles, drawProfileMenu, profileInput } from './profile-layout.js'
import { profileAction } from './profile-actions.js'
const features = {
  assistants: [DEFAULT_ASSISTANT, { ...DEFAULT_ASSISTANT, id: 'reviewer', name: 'Reviewer' }],
  default_assistant: 'atomic-chat',
  skills: Array.from({ length: 12 }, (_, index) => ({
    name: `skill-${index}`,
    description: 'Review code',
    body: `Instructions ${index}`,
    enabled: true,
    updated_at: 0,
  })),
  connectors: [],
  connector_status: {},
  attachments: DEFAULT_ATTACHMENTS,
}
const state = () =>
  ({
    ...createWorkspace('access'),
    setupComplete: true,
    settingsGroup: 'skills',
    featureSelection: 'skill-0',
    workspace: { features },
  }) as unknown as WorkspaceState
it('matches the desktop split list and instruction pane, and stacks them on small terminals', () => {
  for (const width of [48, 100]) {
    const c = canvas(width + 4, 35),
      s = state()
    drawProfiles(c, s, 1, 1, width, 33, 'feature-select:skill-0')
    const select = c.targets.find((t) => t.id === 'feature-select:skill-0')!,
      edit = c.targets.find((t) => t.id === 'feature-edit:skill-0')!
    expect(
      c.cells
        .flat()
        .map((v) => v.char)
        .join('')
    ).toContain('Instructions 0')
    expect(width > 64 ? edit.x > select.x : edit.y > select.y).toBe(true)
    expect(c.targets.every((target) => target.x >= 0 && target.x + target.width <= c.width)).toBe(true)
  }
})
it('keeps offscreen skill entries accessible by keyboard and allows Tab to leave the list', () => {
  let s = { ...state(), focus: 'feature-skill-create' }
  for (let index = 0; index < 34; index++) s = { ...s, ...profileInput({ tab: true } as Key, s)?.patch }
  expect(s.featureSelection).toBe('skill-11')
  s = { ...s, focus: 'feature-edit:skill-11' }
  expect(profileInput({ tab: true } as Key, s)).toBeUndefined()
})
it('opens desktop action/default menus and carries a selected skill into a new chat', async () => {
  let s = state()
  const ctx = {
    get: () => s,
    update: (fn: (s: WorkspaceState) => WorkspaceState) => {
      s = fn(s)
    },
    controller: { history: { save: vi.fn() } },
  } as unknown as ActionContext
  await profileAction('feature-skill-menu:skill-0', ctx)
  const c = canvas(90, 30)
  expect(drawProfileMenu(c, s, s.focus)).toBe(true)
  expect(c.targets.map((t) => t.id)).toEqual([
    'feature-try:skill-0',
    'feature-export:skill-0',
    'feature-edit:skill-0',
    'feature-delete:skill-0',
    'close',
  ])
  await profileAction('feature-try:skill-0', ctx)
  expect(s).toMatchObject({ page: 'chat', overlay: null, chatPreferences: { atomic_skills: ['skill-0'] } })
  await profileAction('feature-assistant-default', ctx)
  const defaults = canvas(90, 30)
  drawProfileMenu(defaults, s, s.focus)
  expect(defaults.targets.map((t) => t.id)).toContain('feature-default:reviewer')
  const assistants = canvas(100, 35)
  drawProfiles(assistants, { ...s, settingsGroup: 'assistants' }, 1, 1, 95, 33, '')
  expect(assistants.targets.map((t) => t.id)).toContain('feature-assistant-default')
})
