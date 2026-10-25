import { record, rows, text } from '../types'
import type { Execute } from '../types'
import { catalogCards } from '../library/catalog/catalog-data'
import { engineFamily } from '@view'
import type { RecordValue } from '../types'

/** Which install dialog an engine's models take, by the core's kinds: a checkpoint, a Foundry or a LiteRT-LM variant. */
export const engineDialog = (engine: string): 'managed' | 'foundry' | 'litert' | null => {
  const family = engineFamily(engine)
  return family === 'managed' || family === 'foundry' || family === 'litert' ? family : null
}

/** Setup's models for `engine`: its own catalog for a managed engine, Foundry Local or LiteRT-LM, else the category's. */
export async function setupModels(
  execute: Execute,
  engine: string,
  category: string
): Promise<RecordValue[]> {
  const kind = engineDialog(engine)
  if (kind === 'managed')
    return catalogCards(await execute('models.catalog', { engine }), 'safetensors', engine)
  if (kind === 'foundry' || kind === 'litert')
    return catalogCards(await execute('models.search', { engine, query: '' }), kind)
  return rows(await execute('models.catalog', { category }))
}

/** The catalog models an engine can run for a setup goal's category. */
export function engineModels(models: RecordValue[], engine: string, category: string) {
  return models.filter((model) => {
    const source = record(model.source)
    // A managed engine's checkpoints and Foundry Local's and LiteRT-LM's variants come from their own catalogs.
    if (engineDialog(engine))
      return ['safetensors', 'Foundry Local', 'LiteRT-LM'].includes(text(model.format))
    if (category === 'text') return (source.format === 'mlx') === (engine === 'mlx')
    if (category === 'image' || category === 'video') return engine === 'sd-cpp'
    return engine === text(source.engine, category === 'decision' ? 'llamacpp' : 'llamacpp-upstream')
  })
}
