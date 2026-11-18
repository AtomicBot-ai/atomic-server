// Lifted from Atomic-Chat/web-app/src/containers/server-concept/EngineModelFields.tsx @ 5043013; adapted: only metadata returned by the server, with the desktop engine identities.
import { engineName, formatSize } from '@view'
import { EngineMark } from '../EngineMark'
import { ModelMark } from '../library/catalog/ModelMark'
import { text } from '../types'
import type { RecordValue } from '../types'
import type { DetailChoice } from './DetailPicker'

const engineDetails: Record<string, string> = {
  'llamacpp-upstream': 'CPU & GPU inference',
  'llamacpp': 'Quantized KV cache · lower memory use',
  'mlx': 'Optimized for Apple silicon',
  'atomic-prism': 'Compact inference for Bonsai models',
}

export function engineChoice(id: string): DetailChoice {
  return {
    id,
    name: engineName(id),
    detail: engineDetails[id],
    icon: <EngineMark engine={id} />,
  }
}

export function modelChoice(model: RecordValue, status = 'Downloaded'): DetailChoice {
  const id = text(model.id ?? model.model_id, '')
  const size = typeof model.size_bytes === 'number' ? `${formatSize(model.size_bytes)} on disk` : ''
  const detail = text(model.description, '')
  return {
    id,
    name: text(model.name ?? model.id ?? model.model_id),
    detail: detail || undefined,
    metadata: [status, size].filter(Boolean).join(' · '),
    icon: <ModelMark model={model} />,
  }
}
