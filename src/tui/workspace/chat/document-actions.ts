import type { ActionContext } from '../actions.js'
import { DEFAULT_ATTACHMENTS } from '../../../contract/index.js'
export async function documentAction(id: string, ctx: ActionContext) {
  const s = ctx.get()
  if (id === 'attachments') {
    ctx.update((v) => ({ ...v, overlay: 'images', focus: 'document-add' }))
    return true
  }
  if (id === 'document-add') {
    if ((s.documents?.length ?? 0) + s.images.length >= 5)
      throw new Error('Attach up to five files per message.')
    if (s.workspace?.features?.attachments.enabled === false)
      throw new Error('Enable document attachments in Settings first.')
    ctx.update((v) => ({
      ...v,
      overlay: 'endpoint',
      edit: 'document-path',
      editValue: '',
      focus: 'save-edit',
    }))
    return true
  }
  if (id === 'save-edit' && s.edit === 'document-path') {
    const document = await ctx.controller.document(
      s.editValue,
      s.workspace?.features?.attachments.max_file_size_mb ?? DEFAULT_ATTACHMENTS.max_file_size_mb
    )
    ctx.update((v) => ({
      ...v,
      documents: [...(v.documents ?? []), document],
      overlay: null,
      focus: 'composer',
    }))
    return true
  }
  if (id.startsWith('document-remove:')) {
    ctx.update((v) => ({
      ...v,
      documents: v.documents?.filter((_, index) => index !== Number(id.slice(16))),
      focus: 'document-add',
    }))
    return true
  }
  return false
}
