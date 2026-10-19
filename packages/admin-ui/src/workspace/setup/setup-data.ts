import { record, text } from '../types'
import type { RecordValue } from '../types'

/** The catalog models an engine can run for a setup goal's category. */
export function engineModels(models: RecordValue[], engine: string, category: string) {
  return models.filter((model) => {
    const source = record(model.source)
    if (category === 'text') return (source.format === 'mlx') === (engine === 'mlx')
    if (category === 'image' || category === 'video') return engine === 'sd-cpp'
    return engine === text(source.engine, category === 'decision' ? 'llamacpp' : 'llamacpp-upstream')
  })
}
