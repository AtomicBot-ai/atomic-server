import type { WorkspaceState } from '../state.js'
import type { LibraryRow } from './library-model.js'
import { record } from './library-model.js'
import { modelJob } from './model-job.js'
/** Local files remain manageable even when their repository is absent from the remote catalog. */
export function withInstalledRows(rows: LibraryRow[], state: WorkspaceState): LibraryRow[] {
  if (state.libraryCategory !== 'text') return rows
  const additional = state.installed.filter(
    (model) =>
      !rows.some(
        (row) => row.id === model.id || record(modelJob(state, row.id)?.['plan'])['model_id'] === model.id
      )
  )
  return [
    ...additional.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      category: 'text',
      description: 'Installed on this device',
      source: {
        installed: true,
        engine: model.provider,
        format:
          model.provider === 'mlx'
            ? 'mlx'
            : model.store === 'managed'
              ? 'safetensors'
              : model.provider === 'foundry-local'
                ? 'foundry'
                : 'gguf',
      },
    })),
    ...rows,
  ]
}
