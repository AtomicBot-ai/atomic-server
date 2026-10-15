import { randomUUID } from 'node:crypto'
import { installEngine, ensureArtifactEngine } from './engine-install.js'
import type { CoreLink } from '../core-link/index.js'
import type { WorkspaceInput } from '../contract/index.js'
import { object, segment } from './validation.js'
export const NOT_CORE = Symbol('not-core')
export async function coreOperation(link: CoreLink, name: string, input: WorkspaceInput): Promise<unknown> {
  const request = object(input['request']),
    id = () => segment(input['id']),
    model = () =>
      `/models/${segment(input['provider'])}/${String(input['model_id']).split('/').map(segment).join('/')}`
  const get = (path: string) => link.request('GET', path),
    post = (path: string, body: unknown = {}) => link.request('POST', path, body)
  switch (name) {
    case 'models.load':
      if (['llamacpp-upstream', 'llamacpp', 'atomic-prism'].includes(String(input['provider'])))
        await ensureArtifactEngine(link, String(input['provider']), `chat-engine-${randomUUID()}`)
      return link.models.load(String(input['provider']), String(input['model_id']), object(input['options']))
    case 'models.unload':
      return link.models.unload(String(input['provider']), String(input['model_id']))
    case 'models.cancel':
      return { cancelled: await link.models.cancelLoad(String(input['provider']), String(input['model_id'])) }
    case 'models.info':
      return get(`${model()}/capabilities`)
    case 'models.logs':
      return get(`${model()}/logs`)
    case 'models.remove':
      return link.request(
        'DELETE',
        `/managed-models/${String(input['model_id']).split('/').map(segment).join('/')}`
      )
    case 'engines.list':
      return post('/engines/versions', input)
    case 'engines.catalog': {
      const engine = String(input['engine'])
      if (['tensorrt-llm', 'vllm'].includes(engine)) return link.environments.list()
      return post(
        ['sd-cpp', 'mlx'].includes(engine)
          ? `/engine-builds/${segment(engine)}/catalog`
          : `/backends/${segment(engine)}/catalog`,
        { ...(input['force'] !== undefined ? { force: input['force'] } : {}) }
      )
    }
    case 'engines.install':
      return installEngine(link, String(input['engine']), request)
    case 'engines.activate':
      return post(
        `/engines/${segment(input['engine'])}/builds/${segment(input['version'])}/${segment(input['variant'])}/activate`
      )
    case 'engines.remove':
      return link.request(
        'DELETE',
        `/engines/${segment(input['engine'])}/builds/${segment(input['version'])}/${segment(input['variant'])}`
      )
    case 'settings.get':
      return get(`/settings/${segment(input['provider'])}`)
    case 'settings.update':
      return link.request('PATCH', `/settings/${segment(input['provider'])}`, {
        values: input['values'],
        ...(input['expected_revision'] !== undefined
          ? { expected_revision: input['expected_revision'] }
          : {}),
      })
    case 'hardware.info':
      return get('/hardware/info')
    case 'hardware.refresh':
      return post('/hardware/refresh')
    case 'hardware.devices':
      return get(`/hardware/devices?provider=${segment(input['provider'] ?? 'llamacpp-upstream')}`)
    case 'environments.list':
      return link.environments.list()
    case 'environments.probe':
      return link.environments.probe(request)
    case 'environments.begin':
      return link.environments.begin(String(input['id']), request)
    case 'environments.get':
      return link.environments.get(String(input['id']))
    case 'environments.cancel':
      return link.environments.cancel(String(input['id']))
    case 'environments.resume':
      return link.environments.resume(String(input['id']), request)
    case 'remote.status':
      return get('/remote-access')
    case 'remote.addresses':
      return get('/lan-addresses')
    case 'remote.start':
      return post('/remote-access/start', request)
    case 'remote.stop':
      return post('/remote-access/stop')
    case 'media.configure':
      return link.request('PUT', '/diffusion/config', request)
    case 'media.load':
      return post('/diffusion/model/load', request)
    case 'media.unload':
      return post('/diffusion/model/unload')
    case 'media.status':
      return get('/diffusion/status')
    case 'media.files':
      return get('/diffusion/model-files')
    case 'media.capabilities':
      return get('/diffusion/capabilities')
    case 'media.image.create':
      return post('/diffusion/jobs', request)
    case 'media.image.job':
      return get(`/diffusion/jobs/${id()}`)
    case 'media.image.cancel':
      return post(`/diffusion/jobs/${id()}/cancel`)
    case 'media.image.gallery':
      return get('/diffusion/gallery?offset=0&limit=100')
    case 'media.image.export':
      return post(`/diffusion/gallery/${id()}/export`, { targetPath: input['targetPath'] })
    case 'media.video.capabilities':
      return get('/diffusion/video/capabilities')
    case 'media.video.create':
      return post('/diffusion/video/jobs', request)
    case 'media.video.job':
      return get(`/diffusion/video/jobs/${id()}`)
    case 'media.video.cancel':
      return post(`/diffusion/video/jobs/${id()}/cancel`)
    case 'media.video.gallery':
      return get('/diffusion/video/gallery?offset=0&limit=100')
    case 'media.video.export':
      return post(`/diffusion/video/gallery/${id()}/export`, { targetPath: input['targetPath'] })
    case 'media.video.estimate':
      return post('/diffusion/video/estimate', request)
    case 'media.embedding.configure':
      return link.request('PUT', '/embedding/config', request)
    case 'media.embedding.config':
      return get('/embedding/config')
    case 'media.embedding.status':
      return get('/embedding/status')
    case 'media.embedding.load':
      return post('/embedding/load')
    case 'media.embedding.unload':
      return post('/embedding/unload')
    case 'media.embedding.run':
      return post('/embedding/embed', request)
    case 'media.decision.configure':
      return link.request('PUT', '/decision/config', request)
    case 'media.decision.config':
      return get('/decision/config')
    case 'media.decision.status':
      return get('/decision/status')
    case 'media.decision.load':
      return post('/decision/load')
    case 'media.decision.unload':
      return post('/decision/unload')
    case 'media.decision.run':
      return post('/decision/decide', request)
    case 'media.router.run':
      return post('/decision/score', request)
    default:
      return NOT_CORE
  }
}
