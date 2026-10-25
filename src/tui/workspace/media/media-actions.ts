import type { ActionContext } from '../actions.js'
import { record } from '../library/library-model.js'
import { fieldValue, inputObject, setField } from '../operations/operation-model.js'
import {
  loadedMediaModel,
  mediaJob,
  mediaRequestDefaults,
  mediaRows,
  mediaTask,
  pendingMedia,
} from './media-model.js'

export async function mediaAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    task = mediaTask(s),
    c = ctx.controller
  if (!task) return false
  if (
    id === 'close' &&
    (s.overlay === 'media-models' || s.overlay === 'media-stop' || s.overlay === 'media-preview')
  ) {
    ctx.update((v) => ({
      ...v,
      overlay: null,
      focus: s.overlay === 'media-stop' ? 'media-stop' : 'media-models',
    }))
    return true
  }
  if (
    (s.media.loading || pendingMedia(s)) &&
    (id.startsWith('operation-field:') || ['media-models', 'media-reset'].includes(id))
  )
    return true
  const patch = (values: Partial<typeof s.media>) =>
    ctx.update((v) => ({ ...v, media: { ...v.media, ...values } }))
  const same = () => mediaTask(ctx.get()) === task
  const run = async (work: () => Promise<void>) => {
    patch({ loading: true, error: '' })
    try {
      await work()
    } catch (error) {
      if (same()) patch({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (same()) patch({ loading: false })
    }
  }
  if (id === 'media-refresh') {
    await run(async () => {
      const gallery = mediaRows(await c.runtime.execute(`media.${task}.gallery`))
      if (same())
        patch({ gallery, selected: Math.max(0, Math.min(ctx.get().media.selected, gallery.length - 1)) })
      if (loadedMediaModel(s)) {
        const capabilities = record(
          await c.runtime.execute(task === 'video' ? 'media.video.capabilities' : 'media.capabilities')
        )
        if (same()) {
          ctx.update((v) => {
            const current = record(inputObject(v.operationInput)['request'])
            const preserve = Object.keys(v.media.capabilities).length
              ? current
              : Object.fromEntries(
                  Object.entries(current).filter(([key]) =>
                    ['prompt', 'negativePrompt', 'workflow'].includes(key)
                  )
                )
            return {
              ...v,
              media: { ...v.media, capabilities },
              operationInput: JSON.stringify({
                request: { ...mediaRequestDefaults(v, capabilities), ...preserve },
              }),
            }
          })
        }
      }
    })
    return true
  }
  if (id === 'media-models') {
    ctx.update((v) => ({ ...v, overlay: 'media-models', focus: 'media-model:0' }))
    await run(async () => {
      const models = mediaRows(await c.runtime.execute('artifacts.list')).filter(
        (model) =>
          model['stage'] === 'ready' && (model['category'] ?? record(model['plan'])['category']) === task
      )
      if (same()) patch({ models })
    })
    return true
  }
  if (id.startsWith('media-model:')) {
    const model = s.media.models[Number(id.slice(12))]
    if (!model || s.media.loading) return true
    await run(async () => {
      await c.runtime.execute('artifacts.load', { id: model['id'] })
      if (!same()) return
      ctx.update((v) => ({
        ...v,
        media: { ...v.media, capabilities: {} },
        overlay: null,
        focus: 'operation-field:request.prompt',
      }))
      await c.run({ name: 'refresh' })
      const workspace = await c.runtime.snapshot()
      if (same()) ctx.update((v) => ({ ...v, workspace }))
      await mediaAction('media-refresh', ctx)
    })
    return true
  }
  if (id === 'media-browse') {
    ctx.update((v) => ({ ...v, overlay: null, libraryCategory: task }))
    const { libraryAction } = await import('../library/library-actions.js')
    return libraryAction('library:catalog', ctx)
  }
  if (id === 'media-advanced') {
    patch({ advanced: !s.media.advanced })
    return true
  }
  if (id === 'media-gallery') {
    patch({ galleryView: !s.media.galleryView })
    ctx.update((v) => ({ ...v, focus: 'media-gallery', scroll: 0 }))
    return true
  }
  if (id === 'scroll-up' || id === 'scroll-down') {
    ctx.update((v) => ({
      ...v,
      scroll: Math.max(0, v.scroll + (id === 'scroll-up' ? -3 : 3)),
      focus: 'media-scroll',
    }))
    return true
  }
  if (id === 'media-reset') {
    ctx.update((v) => ({
      ...v,
      operationInput: JSON.stringify({
        request: {
          ...mediaRequestDefaults(v),
          workflow: fieldValue(v.operationInput, 'request.workflow') ?? 'create',
          prompt: fieldValue(v.operationInput, 'request.prompt') ?? '',
          negativePrompt: fieldValue(v.operationInput, 'request.negativePrompt'),
        },
      }),
    }))
    return true
  }
  if (id.startsWith('media-select:')) {
    patch({ selected: Number(id.slice(13)) })
    return true
  }
  if (id === 'media-previous' || id === 'media-next') {
    const length = s.media.gallery.length
    if (length) patch({ selected: (s.media.selected + (id === 'media-next' ? 1 : -1) + length) % length })
    return true
  }
  if (id === 'media-restore') {
    const recipe = record(s.media.gallery[s.media.selected]?.['recipe'])
    ctx.update((v) => ({
      ...v,
      operationInput: JSON.stringify({ request: recipe }),
      focus: 'operation-field:request.prompt',
    }))
    return true
  }
  if (id === 'media-save') {
    ctx.update((v) => ({ ...v, overlay: 'endpoint', edit: 'media-save', editValue: '', focus: 'save-edit' }))
    return true
  }
  if (id === 'media-preview') {
    ctx.update((v) => ({ ...v, overlay: 'media-preview', focus: 'media-save' }))
    return true
  }
  if (id === 'save-edit' && s.edit === 'media-save') {
    const item = s.media.gallery[s.media.selected]
    if (!item || !s.editValue.trim()) return true
    await run(async () => {
      await c.runtime.execute(`media.${task}.export`, { id: item['id'], targetPath: s.editValue })
      if (same())
        ctx.update((v) => ({ ...v, overlay: null, edit: '', message: 'Result saved.', focus: 'media-save' }))
    })
    return true
  }
  if (id === 'operation-field:request.workflow') {
    const workflows = s.media.capabilities['workflows']
    ctx.update((v) => ({
      ...v,
      overlay: 'operation-choice',
      operationField: 'request.workflow',
      operationChoices: Array.isArray(workflows)
        ? workflows.filter(
            (value): value is string => typeof value === 'string' && value !== 'image-to-video'
          )
        : ['create'],
      focus: 'operation-choice:0',
    }))
    return true
  }
  if (['operation-field:request.initImage', 'operation-field:request.maskImage'].includes(id)) {
    ctx.update((v) => ({
      ...v,
      overlay: 'endpoint',
      edit: `media-source:${id.slice(16)}`,
      editValue: '',
      focus: 'save-edit',
    }))
    return true
  }
  if (id === 'save-edit' && s.edit.startsWith('media-source:')) {
    await run(async () => {
      const image = await c.image(s.editValue)
      if (same())
        ctx.update((v) => ({
          ...v,
          operationInput: setField(v.operationInput, s.edit.slice(13), { base64: image.url.split(',')[1] }),
          overlay: null,
          edit: '',
          focus: `operation-field:${s.edit.slice(13)}`,
        }))
    })
    return true
  }
  if (id === 'media-stop') {
    ctx.update((v) => ({ ...v, overlay: 'media-stop', focus: 'media-keep' }))
    return true
  }
  if (id === 'media-keep') {
    ctx.update((v) => ({ ...v, overlay: null, focus: 'media-stop' }))
    return true
  }
  if (id === 'media-stop-confirm') {
    await run(async () => {
      await c.runtime.execute(`media.${s.media.task}.cancel`, { id: s.media.job?.['id'] })
      patch({
        job: mediaJob(await c.runtime.execute(`media.${s.media.task}.job`, { id: s.media.job?.['id'] })),
      })
      ctx.update((v) => ({ ...v, overlay: null, focus: 'operation-run' }))
    })
    return true
  }
  if (id === 'operation-run' && s.operation === `media.${task}.create`) {
    if (s.media.loading || pendingMedia(s)) return true
    if (!loadedMediaModel(s)) {
      patch({ error: 'Choose a downloaded model before generating.' })
      return true
    }
    if (!String(fieldValue(s.operationInput, 'request.prompt') ?? '').trim()) {
      patch({ error: 'Enter a prompt.' })
      return true
    }
    await run(async () => {
      const created = record(await c.runtime.execute(s.operation, inputObject(s.operationInput)))
      const jobId = created['jobId'] ?? mediaJob(created)['id']
      if (!jobId) throw new Error('Generation did not return a job ID.')
      const job = mediaJob(await c.runtime.execute(`media.${task}.job`, { id: jobId }))
      patch({ task, job })
      if (same()) {
        ctx.update((v) => ({ ...v, focus: 'media-stop' }))
        if (!pendingMedia(ctx.get())) await mediaAction('media-refresh', ctx)
      }
    })
    return true
  }
  return false
}
