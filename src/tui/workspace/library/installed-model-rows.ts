import { localModelStatus } from '../../../workspace-view/index.js'
import type { WorkspaceState } from '../state.js'
import { record } from './library-model.js'

/** The local library contains files and ready media artifacts, never remote discovery results. */
export function installedModelRows(s: WorkspaceState) {
  return [
    ...s.installed.map((model, index) => ({
      id: `installed:${index}`,
      remove: `installed-delete:${encodeURIComponent(model.id)}`,
      name: `${model.name || model.id}${model.providers?.length ? '  ' + model.providers.join(', ') : ''}`,
      status: localModelStatus(
        s.workspace,
        [
          {
            model: model.id,
            providers: model.providers?.length ? model.providers : [model.provider],
            kind: 'chat',
          },
        ],
        true
      ),
    })),
    ...(s.workspace?.setups ?? []).flatMap((value) => {
      const job = record(value),
        plan = record(job['plan'])
      const category = String(plan['category'] ?? '')
      if (job['stage'] !== 'ready' || !['image', 'video', 'embedding', 'decision'].includes(category))
        return []
      const kind = category === 'image' || category === 'video' ? 'image-video' : category
      return [
        {
          id: `media-installed:${job['id']}`,
          remove: `media-delete:${job['id']}`,
          name: String(plan['name'] ?? plan['model_id']),
          status: localModelStatus(
            s.workspace,
            [
              {
                model: String(plan['model_id'] ?? ''),
                providers: [String(plan['engine'] ?? (kind === 'image-video' ? 'sd-cpp' : ''))],
                kind: kind as 'image-video' | 'embedding' | 'decision',
              },
            ],
            true
          ),
        },
      ]
    }),
  ]
}
