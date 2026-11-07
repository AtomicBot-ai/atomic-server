import { matchesEngineFilter, modelEngines } from '../workspace-view/index.js'
import type { HubRepository } from './types.js'
import type { SetupWorkspace } from './service.js'

/** The same server catalog as admin, scoped to the chosen GGUF or MLX engine. */
export async function engineModels(
  workspace: Pick<SetupWorkspace, 'execute'>,
  choice: string,
  query: string
): Promise<HubRepository[]> {
  const engine = choice.split('|')[0] ?? ''
  const result = (await workspace.execute(
    query ? 'models.search' : 'models.catalog',
    query ? { engine, query } : { category: 'text' }
  )) as { rows: Array<Record<string, unknown>> }
  return result.rows
    .filter((row) => {
      const source = row['source'] as Record<string, unknown> | undefined
      const providers = row['providers'] ?? source?.['providers'] ?? source?.['engines']
      return matchesEngineFilter(
        engine,
        modelEngines(
          Array.isArray(providers) ? providers.filter((p): p is string => typeof p === 'string') : [],
          String(source?.['format'] ?? 'gguf'),
          String(row['id'])
        )
      )
    })
    .map((row) => ({
      id: String(row['id']),
      downloads: Number(row['downloads'] ?? 0),
      title: String(row['name'] ?? row['title'] ?? row['id']),
      summary: String(row['description'] ?? row['summary'] ?? ''),
      ...(engine === 'mlx' ? { source: { format: 'mlx' as const } } : {}),
    }))
}
