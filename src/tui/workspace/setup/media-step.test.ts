import { expect, it, vi } from 'vitest'
import { activate, type ActionContext } from '../actions.js'
import { createWorkspace, type WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { hit } from '../draw/canvas.js'
import { loadSetupMedia } from './media-step.js'
const rows = [
  { id: 'image-a', name: 'Image A', category: 'image', description: 'Fast images' },
  { id: 'image-b', name: 'Image B', category: 'image', description: 'Detailed images' },
  { id: 'video-a', name: 'Video A', category: 'video', description: 'Short videos' },
]
function fixture() {
  let s: WorkspaceState = { ...createWorkspace('welcome'), firstRun: 'media' }
  let failed = ''
  const execute = vi.fn(async (op: string, input: Record<string, unknown> = {}) => {
    if (op === 'models.catalog') {
      if (input['category'] === failed) throw new Error('Catalog unavailable')
      return { rows: rows.filter((row) => row.category === input['category']) }
    }
    if (op === 'artifacts.plan') return { digest: 'media', blockers: [], model_id: input['model_id'] }
    if (op === 'artifacts.install')
      s = {
        ...s,
        workspace: {
          setups: [
            {
              id: 'queued',
              stage: 'downloading',
              plan: {
                category: s.libraryCategory,
                model_id: s.setupMedia[s.libraryCategory as 'image' | 'video'],
              },
            },
          ],
          downloads: [],
        } as never,
      }
    if (op === 'downloads.remove') s = { ...s, workspace: { setups: [], downloads: [] } as never }
    return {}
  })
  const ctx: ActionContext = {
    get: () => s,
    update: (fn) => {
      s = fn(s)
    },
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
    controller: { runtime: { execute, snapshot: async () => s.workspace } } as unknown as WorkspaceController,
  }
  return {
    ctx,
    execute,
    get: () => s,
    fail: (category: string) => {
      failed = category
    },
    action: (id: string) => activate(id, ctx),
  }
}
const shown = (s: WorkspaceState, width = 120, height = 36) =>
  workspaceFrame(s, width, height, 0)
    .cells.map((row) => row.map((cell) => cell.char).join(''))
    .join('\n')
it('uses the desktop image/video cards without extra model menus, queues each model, and confirms removal', async () => {
  const t = fixture()
  await loadSetupMedia(t.ctx)
  let frame = workspaceFrame(t.get(), 120, 36, 0)
  expect(frame.targets.filter((target) => target.id.startsWith('media-model:'))).toHaveLength(0)
  expect(frame.targets.find((target) => target.id === 'media-queue:0')!.y).toBe(
    frame.targets.find((target) => target.id === 'media-queue:1')!.y
  )
  expect(shown(t.get())).toContain('Image generation')
  expect(shown(t.get())).toContain('Video generation')
  expect(shown(t.get())).toContain('Image A')
  expect(t.get()).toMatchObject({ overlay: null, setupMedia: { image: 'image-a', video: 'video-a' } })
  await t.action('media-queue:0')
  expect(t.execute).toHaveBeenCalledWith('artifacts.plan', { category: 'image', model_id: 'image-a' })
  expect(t.get()).toMatchObject({ page: 'welcome', firstRun: 'media', focus: 'media-queue:0' })
  await t.action('media-queue:0')
  expect(t.get().overlay).toBe('download-remove')
  expect(t.execute).not.toHaveBeenCalledWith('downloads.remove', expect.anything())
  const cancel = workspaceInput('', { escape: true } as never, t.get(), workspaceFrame(t.get(), 54, 24, 0))
  await t.action(cancel.action!)
  expect(t.get()).toMatchObject({
    overlay: null,
    focus: 'media-queue:0',
    selected: 0,
    downloadSelection: null,
  })
  await t.action('media-queue:0')
  await t.action('download-remove-confirm')
  expect(t.execute).toHaveBeenCalledWith('downloads.remove', { id: 'queued', owner: 'artifacts' })
  expect(t.get()).toMatchObject({
    overlay: null,
    focus: 'media-queue:0',
    selected: 0,
    downloadSelection: null,
  })
  frame = workspaceFrame(t.get(), 120, 36, 0)
  expect(frame.targets.some((target) => target.id === 'media-queue:1')).toBe(true)
})
it('keeps a working category when the other fails and recovers without resetting its selection', async () => {
  const t = fixture()
  t.fail('video')
  await loadSetupMedia(t.ctx)
  expect(t.get().libraryRows.map((row) => row.id)).toEqual(['image-a', 'image-b'])
  expect(shown(t.get())).toContain('Could not load models')
  expect(workspaceFrame(t.get(), 120, 36, 0).targets.some((target) => target.id === 'media-refresh')).toBe(
    true
  )
  await t.action('media-queue:0')
  expect(t.execute).toHaveBeenCalledWith('artifacts.plan', { category: 'image', model_id: 'image-a' })
  t.fail('')
  await t.action('media-refresh')
  expect(t.get().setupMedia).toMatchObject({ image: 'image-a', video: 'video-a', errors: {}, loading: false })
})
it('scrolls to the visible video queue control and activates it with Enter', async () => {
  const t = fixture()
  await loadSetupMedia(t.ctx)
  const wheel = workspaceInput('\u001b[<65;20;10M', {} as never, t.get(), workspaceFrame(t.get(), 54, 24, 0))
  t.ctx.update((s) => ({ ...s, ...wheel.patch }))
  expect(t.get().focus).toBe('media-queue:1')
  const frame = workspaceFrame(t.get(), 54, 24, 0)
  expect(frame.targets.some((target) => target.id === t.get().focus)).toBe(true)
  const enter = workspaceInput('', { return: true } as never, t.get(), frame)
  await t.action(enter.action!)
  expect(t.execute).toHaveBeenCalledWith('artifacts.plan', { category: 'video', model_id: 'video-a' })
  expect(t.get().overlay).toBeNull()
})
it('returns to the video card after cancelling or confirming deletion of an installed model', async () => {
  const t = fixture()
  await loadSetupMedia(t.ctx)
  t.ctx.update((s) => ({
    ...s,
    workspace: {
      downloads: [],
      setups: [
        {
          id: 'installed-video',
          stage: 'ready',
          plan: { category: 'video', model_id: 'video-a' },
        },
      ],
    } as never,
  }))
  await t.action('media-queue:1')
  expect(t.get().downloadSelection?.installed).toBe(true)
  await t.action('close')
  expect(t.get()).toMatchObject({ overlay: null, focus: 'media-queue:1', selected: 1 })
  await t.action('media-queue:1')
  await t.action('download-remove-confirm')
  expect(t.execute).toHaveBeenCalledWith('downloads.remove', {
    id: 'installed-video',
    owner: 'artifacts',
    installed: true,
  })
  expect(t.get()).toMatchObject({ overlay: null, focus: 'media-queue:1', selected: 1 })
})
it.each(['connect', 'models'] as const)(
  'ignores a media catalog response after leaving for %s',
  async (destination) => {
    const t = fixture()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    for (const category of ['image', 'video'])
      t.execute.mockImplementationOnce(async () => {
        await pending
        return { rows: rows.filter((row) => row.category === category) }
      })
    const loading = loadSetupMedia(t.ctx)
    expect(t.get()).toMatchObject({ busy: false, setupMedia: { loading: true } })
    t.ctx.update((s) => ({
      ...s,
      firstRun: destination === 'connect' ? 'connect' : null,
      page: destination === 'connect' ? 'welcome' : 'models',
      libraryRows: [],
      libraryCategory: 'text',
      libraryView: 'installed',
      focus: 'next-screen',
      selected: 4,
      busy: true,
    }))
    finish()
    await loading
    expect(t.get()).toMatchObject({
      libraryRows: [],
      libraryCategory: 'text',
      libraryView: 'installed',
      focus: 'next-screen',
      selected: 4,
      busy: true,
      setupMedia: { loading: false },
    })
  }
)
it('keeps a newer media catalog when an older request finishes last', async () => {
  const t = fixture()
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  for (let i = 0; i < 2; i++)
    t.execute.mockImplementationOnce(async () => {
      await pending
      throw new Error('Outdated failure')
    })
  const older = loadSetupMedia(t.ctx)
  await loadSetupMedia(t.ctx)
  finish()
  await older
  expect(t.get().libraryRows.map((row) => row.id)).toEqual(['image-a', 'image-b', 'video-a'])
  expect(t.get().setupMedia).toMatchObject({ image: 'image-a', video: 'video-a', errors: {}, loading: false })
})
it.each([
  [54, 24],
  [80, 24],
  [120, 36],
])('keeps both categories reachable and controls distinct at %ix%i', async (width, height) => {
  const t = fixture()
  await loadSetupMedia(t.ctx)
  t.ctx.update((s) => ({
    ...s,
    workspace: {
      setups: [
        { id: 'text', stage: 'downloading', plan: { model_id: 'Text model', total_download_bytes: 100 } },
      ],
      downloads: [{ taskId: 'text', transferred: 50, total: 100 }],
    } as never,
  }))
  for (let index = 0; index < 2; index++) {
    const frame = workspaceFrame(t.get(), width!, height!, 0)
    const queue = frame.targets.find((target) => target.id === `media-queue:${index}`)!
    expect(queue).toBeDefined()
    expect(hit(frame, queue.x, queue.y)?.id).toBe(queue.id)
    expect(queue.y + queue.height).toBeLessThanOrEqual(height! - 7)
    const next = workspaceInput('', { downArrow: true } as never, t.get(), frame)
    t.ctx.update((s) => ({ ...s, ...next.patch }))
  }
})

it('keeps media download controls on their cards and includes every transfer in the header queue', async () => {
  const t = fixture()
  await loadSetupMedia(t.ctx)
  const media = {
    id: 'image-job',
    stage: 'downloading',
    plan: { category: 'image', model_id: 'image-a', total_bytes: 100 },
  }
  t.ctx.update((s) => ({ ...s, workspace: { setups: [media], downloads: [] } as never }))
  expect(workspaceFrame(t.get(), 120, 36, 0).targets.some((t) => t.id.startsWith('download-row:'))).toBe(
    false
  )
  t.ctx.update((s) => ({
    ...s,
    workspace: {
      setups: [
        media,
        { id: 'text-job', stage: 'downloading', plan: { model_id: 'Text model', total_download_bytes: 100 } },
      ],
      downloads: [],
    } as never,
  }))
  const frame = workspaceFrame(t.get(), 120, 36, 0)
  expect(frame.targets.some((t) => t.id === 'download-status')).toBe(true)
  expect(frame.targets.some((t) => t.id === 'download-more')).toBe(true)
  expect(frame.targets.filter((t) => t.id === 'download-pause:artifacts:image-job')).toHaveLength(1)
})
