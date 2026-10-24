import type { Key } from 'ink'
import { expect, it } from 'vitest'
import { workspaceFrame } from './frame.js'
import { workspaceInput } from './input.js'
import { createWorkspace } from './state.js'
import { hit } from './draw/canvas.js'
import { drawCompactStatus } from './compact-status.js'
import { canvas } from './draw/canvas.js'
import { brandHeaderRows } from './draw/brand-header.js'
import { sectionMenu } from './navigation.js'

function state(downloading = false) {
  const s = createWorkspace('server')
  s.setupComplete = true
  s.workspace = {
    api: { running: true },
    eye: 'ready',
    core: { version: 'test' },
    services: [],
    setups: downloading
      ? [{ id: 'job', stage: 'downloading', plan: { model_id: 'Qwen3.5 4B', total_download_bytes: 1000 } }]
      : [],
    downloads: downloading ? [{ taskId: 'job', transferred: 450, total: 1000 }] : [],
  } as never
  return s
}

it.each([false, true])(
  'keeps real server/navigation/download actions reachable at60×20 (downloads=%s)',
  (downloading) => {
    const s = state(downloading),
      frame = workspaceFrame(s, 60, 20, 0)
    const shown = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
    expect(shown).toContain('ATOMIC SERVER')
    expect(shown).toContain('Running')
    expect(shown).not.toContain('Expand to at least')
    expect(brandHeaderRows(60, 20)).toBe(2)
    const ids = [
      'api-toggle',
      'page:models',
      'section-menu',
      'server-model-page:engine',
      'server-model-page:model',
      'guide-open',
      'server-endpoint',
    ]
    if (downloading) ids.push('download-pause:setup:job', 'download-remove:setup:job')
    for (const id of ids) {
      const target = frame.targets.find((target) => target.id === id)!
      expect(target, id).toBeDefined()
      expect(hit(frame, target.x, target.y)?.id).toBe(id)
      expect(workspaceInput(`[<0;${target.x + 1};${target.y + 1}M`, {} as Key, s, frame).action).toBe(id)
      expect(workspaceInput('', { return: true } as Key, { ...s, focus: id }, frame).action).toBe(id)
    }
    for (const target of frame.targets) {
      expect(target.x + target.width, target.id).toBeLessThanOrEqual(60)
      expect(target.y + target.height, target.id).toBeLessThanOrEqual(target.y === 19 ? 20 : 17)
    }
  }
)

it('keeps each compact section destination visible and distinct', () => {
  for (const page of ['server', 'models', 'chat', 'access'] as const) {
    const s = { ...state(true), page, overlay: 'sections' as const }
    const frame = workspaceFrame(s, 60, 20, 0)
    const menu = sectionMenu(s)
    for (const item of menu.items) {
      const id = `${menu.prefix}:${item.id}`,
        target = frame.targets.find((target) => target.id === id)!
      expect(target, id).toBeDefined()
      expect(target.y + target.height).toBeLessThan(frame.popover!.y + frame.popover!.height)
      expect(hit(frame, target.x, target.y)?.id, id).toBe(id)
    }
  }
})

it('uses the ordinary overview at standard heights and keeps model list scrolling available in short terminals', () => {
  expect(drawCompactStatus(canvas(80, 24), state(), 16, 5, 62, '')).toBe(false)
  const s = {
    ...state(true),
    page: 'models' as const,
    libraryView: 'installed' as const,
    installed: Array.from({ length: 20 }, (_, i) => ({
      id: `model-${i}`,
      name: `Model ${i}`,
      provider: 'llamacpp-upstream',
    })),
    focus: 'installed:0',
  }
  for (let i = 0; i < 15; i++)
    Object.assign(s, workspaceInput('', { downArrow: true } as Key, s, workspaceFrame(s, 60, 20, 0)).patch)
  const frame = workspaceFrame(s, 60, 20, 0)
  expect(s.focus).toBe('installed:15')
  expect(frame.targets.some((target) => target.id === s.focus)).toBe(true)
})

it.each([{ eta_seconds: 25 }, { progress: { eta_seconds: 25 } }, { bytes_per_second: 22 }])(
  'reserves the queue badge and uses shared transfer estimates in the compact card (%j)',
  (progress) => {
    const s = state(true)
    s.workspace!.downloads = [
      {
        id: 'engine',
        kind: 'engine',
        name: 'llama.cpp Metal nightly build with a long name',
        state: 'downloading',
        total: 1000,
        transferred: 450,
        ...progress,
      },
      { taskId: 'job', transferred: 450, total: 1000 },
    ] as never
    s.workspace!.setups = []
    const frame = workspaceFrame(s, 60, 20, 0)
    const more = frame.targets.find((target) => target.id === 'download-more')!
    expect(more).toBeDefined()
    const card = frame.targets.find((target) => target.id === 'download-status')!
    const lines = frame.cells
      .slice(card.y, card.y + card.height)
      .map((row) => row.map((cell) => cell.char).join(''))
    expect(lines[1]).toContain('[ +1 more ]')
    expect(lines[2]).toContain('~25 sec')
    expect(frame.cells[more.y]![more.x - 1]!.char).toBe(' ')
    expect(frame.cells[more.y]![card.x + card.width - 1]!.char).toBe('|')
    expect(hit(frame, more.x, more.y)?.id).toBe('download-more')
  }
)
