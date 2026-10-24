import { cloudChoices, cloudNeedsKey } from './cloud-catalog.js'
import { CLOUD_CATALOG } from '../../../contract/index.js'
import type { CloudDraft } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import { record } from './library-model.js'
export async function cloudAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    c = ctx.controller
  const onboarding = s.firstRun === 'cloud' && s.page === 'welcome'
  const change = (p: Partial<CloudDraft>) =>
    ctx.update((v) => ({ ...v, cloud: { ...v.cloud, ...p }, hover: '' }))
  if (s.cloud.checking && (id.startsWith('cloud-') || id === 'save-edit' || id === 'close')) return true
  if (id === 'close' && s.edit.startsWith('cloud-') && s.overlay === 'endpoint') {
    ctx.update((v) => ({ ...v, overlay: 'cloud', edit: '', editValue: '', focus: s.edit }))
    return true
  }
  if (id === 'save-edit' && s.edit.startsWith('cloud-')) {
    const field = s.edit.slice(6) as 'provider' | 'url' | 'key' | 'models'
    if (['provider', 'url', 'key', 'models'].includes(field)) change({ [field]: s.editValue })
    ctx.update((v) => ({ ...v, overlay: 'cloud', edit: '', editValue: '', focus: 'cloud-save' }))
    return true
  }
  if (id === 'library:endpoint') {
    const response = record(await c.runtime.execute('cloud.list'))
    const providers = Array.isArray(response['providers'])
      ? (response['providers'] as CloudDraft['providers'])
      : []
    const existing = providers.some((p) => !CLOUD_CATALOG.some((c) => c.id === p.provider))
    change({
      providers,
      provider: '',
      url: '',
      key: '',
      models: '',
      editing: !existing,
      optionsOpen: true,
      error: '',
    })
    ctx.update((v) => ({
      ...v,
      page: 'models',
      libraryView: 'endpoint',
      overlay: existing ? null : 'cloud',
      focus: existing ? 'cloud-add' : 'cloud-provider',
    }))
    return true
  }
  if (!id.startsWith('cloud-') && id !== 'library:cloud') return false
  if (id === 'cloud-open' || id === 'library:cloud') {
    ctx.update((v) => ({
      ...v,
      ...(id === 'library:cloud' ? { page: 'models' as const, libraryView: 'cloud' as const } : {}),
      overlay: null,
      cloud: { ...v.cloud, editing: false, key: '', error: '' },
      focus: 'cloud-choice:0',
      selected: 0,
    }))
    id = 'cloud-refresh'
  }
  if (id.startsWith('cloud-choice:')) {
    const choice = cloudChoices(s.cloud)[Number(id.slice(13))]
    if (onboarding && choice?.saved?.connected) return true
    if (choice) {
      change({
        provider: choice.id,
        url: choice.saved?.base_url ?? choice.url,
        models: choice.saved?.models?.join(', ') ?? '',
        key: '',
        editing: true,
        optionsOpen: !choice.url,
        error: '',
      })
      ctx.update((v) => ({
        ...v,
        overlay: onboarding ? null : 'cloud',
        focus: 'cloud-key',
        selected: Number(id.slice(13)),
      }))
    }
    return true
  }
  if (id === 'cloud-close' && s.libraryView === 'endpoint' && !s.firstRun) {
    change({ editing: false, key: '' })
    ctx.update((v) => ({ ...v, overlay: null, focus: 'cloud-add' }))
    return true
  }
  if (id === 'cloud-close') {
    change({ key: '', editing: false, error: '' })
    ctx.update((v) => ({
      ...v,
      overlay: null,
      edit: '',
      editValue: '',
      focus: `cloud-choice:${Math.max(
        0,
        cloudChoices(v.cloud).findIndex((p) => p.id === v.cloud.provider)
      )}`,
      selected: Math.max(
        0,
        cloudChoices(v.cloud).findIndex((p) => p.id === v.cloud.provider)
      ),
    }))
  } else if (id === 'cloud-options') change({ optionsOpen: !s.cloud.optionsOpen })
  else if (id === 'cloud-add') {
    change({ provider: '', url: '', key: '', models: '', editing: true, optionsOpen: true, error: '' })
    ctx.update((v) => ({ ...v, overlay: 'cloud', focus: 'cloud-provider' }))
  } else if (id.startsWith('cloud-edit:')) {
    const p = s.cloud.providers[Number(id.slice(11))]
    if (p) {
      change({
        provider: p.provider,
        url: p.base_url ?? '',
        key: '',
        models: p.models?.join(', ') ?? '',
        editing: true,
        error: '',
      })
      ctx.update((v) => ({ ...v, overlay: 'cloud', focus: 'cloud-key' }))
    }
  } else if (['cloud-provider', 'cloud-url', 'cloud-key', 'cloud-models'].includes(id)) {
    if (onboarding) {
      ctx.update((v) => ({ ...v, focus: id }))
      return true
    }
    const field = id.slice(6) as 'provider' | 'url' | 'key' | 'models'
    ctx.update((v) => ({
      ...v,
      overlay: 'endpoint',
      edit: id,
      editValue: v.cloud[field],
      focus: 'save-edit',
    }))
  } else {
    try {
      if (id === 'cloud-save') {
        const d = s.cloud
        if (!d.provider.trim()) throw new Error('Enter a provider name.')
        if (cloudNeedsKey(d.provider) && !d.key.trim()) throw new Error('Enter an API key.')
        let url: URL
        try {
          url = new URL(d.url.trim())
        } catch {
          throw new Error('Enter a valid HTTP or HTTPS base URL.')
        }
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error('Use an HTTP or HTTPS URL without credentials, a query, or a fragment.')
        if (!d.key.trim() && d.providers.some((p) => p.provider === d.provider && p.has_api_key))
          throw new Error('Enter the API key again to check this connection.')
        change({ checking: true, error: '' })
        await c.runtime.execute('cloud.connect', {
          provider: d.provider.trim(),
          base_url: d.url.trim(),
          models: d.models
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
          ...(d.key ? { api_key: d.key } : {}),
        })
        change({ key: '', editing: false, checking: false })
        if (onboarding && ctx.get().firstRun !== 'cloud') return true
        ctx.update((v) => ({
          ...v,
          overlay: null,
          focus: 'cloud-choice:0',
          selected: 0,
        }))
      } else if (id.startsWith('cloud-remove:')) {
        const p = s.cloud.providers[Number(id.slice(13))]
        if (p) await c.runtime.execute('cloud.remove', { provider: p.provider })
      } else if (id !== 'cloud-refresh') return false
      const response = record(await c.runtime.execute('cloud.list'))
      change({
        providers: Array.isArray(response['providers'])
          ? (response['providers'] as CloudDraft['providers'])
          : [],
        error: '',
      })
      const current = ctx.get()
      if (
        onboarding &&
        current.firstRun === 'cloud' &&
        current.cloud.provider === s.cloud.provider &&
        ((!s.cloud.provider && !current.cloud.url && !current.cloud.key) || id === 'cloud-save')
      ) {
        const providers = cloudChoices(ctx.get().cloud)
        const at = providers.findIndex((p) => p.id === s.cloud.provider)
        const next = !s.cloud.provider
          ? providers.find((p) => p.id === 'openrouter')
          : [...providers.slice(at + 1), ...providers.slice(0, at)].find((p) => p.id && !p.saved?.connected)
        if (next) {
          change({
            provider: next.id,
            url: next.saved?.base_url ?? next.url,
            models: next.saved?.models?.join(', ') ?? '',
            optionsOpen: !next.url,
            editing: true,
          })
          ctx.update((v) => ({
            ...v,
            selected: providers.indexOf(next),
            focus: `cloud-choice:${providers.indexOf(next)}`,
          }))
        }
      }
    } catch (e) {
      change({ checking: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return true
}
