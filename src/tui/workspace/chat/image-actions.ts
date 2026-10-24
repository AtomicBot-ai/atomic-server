import type { ActionContext } from '../actions.js'
export async function imageAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { get, update, controller } = ctx,
    s = get()
  if ((id === 'images' || id === 'image-add') && s.modelVision === false) {
    update((v) => ({ ...v, message: `${s.model} does not take images.` }))
    return true
  }
  if (id === 'images') {
    if (s.images.length) update((v) => ({ ...v, overlay: 'images', focus: 'image-add' }))
    else return imageAction('image-add', ctx)
    return true
  }
  if (id === 'image-add') {
    if (s.images.length + (s.documents?.length ?? 0) >= 5)
      throw new Error('Attach up to five files per message.')
    update((v) => ({ ...v, overlay: 'endpoint', edit: 'image-path', editValue: '', focus: 'save-edit' }))
    return true
  }
  if (id.startsWith('image-remove:')) {
    update((v) => ({
      ...v,
      images: v.images.filter((_, i) => i !== Number(id.slice(13))),
      focus: 'image-add',
    }))
    return true
  }
  if (id === 'save-edit' && s.edit === 'image-path') {
    const image = await controller.image(s.editValue)
    update((v) => ({ ...v, images: [...v.images, image], overlay: null, focus: 'composer', message: '' }))
    return true
  }
  return false
}
