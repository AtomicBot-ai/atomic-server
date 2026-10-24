// Lifted from Atomic-Chat/web-app/src/containers/server-concept/EngineModelFields.tsx @ 5043013; adapted: only metadata returned by the server, with the desktop engine identities.
import { Cpu } from 'lucide-react'
import { engineName, formatSize } from '@view'
import { ModelMark } from '../library/ModelMark'
import { text } from '../types'
import type { RecordValue } from '../types'
import type { DetailChoice } from './DetailPicker'

const engineDetails: Record<string, { logo: string; detail: string; monochrome?: boolean }> = {
  'llamacpp-upstream': {
    logo: '/engine-brands/llamacpp.svg',
    detail: 'CPU & GPU inference',
    monochrome: true,
  },
  'llamacpp': {
    logo: '/engine-brands/llamacpp.svg',
    detail: 'Quantized KV cache · lower memory use',
    monochrome: true,
  },
  'mlx': { logo: '/engine-brands/mlx.png', detail: 'Optimized for Apple silicon' },
  'atomic-prism': {
    logo: '/model-brands/images/model-provider/prism-ml.webp',
    detail: 'Compact inference for Bonsai models',
    monochrome: true,
  },
}

export function engineChoice(id: string): DetailChoice {
  const info = engineDetails[id]
  return {
    id,
    name: engineName(id),
    detail: info?.detail,
    icon: (
      <span className={`server-picker-logo ${info?.monochrome ? 'monochrome' : ''}`} aria-hidden="true">
        {info ? <img src={info.logo} alt="" /> : <Cpu size={28} />}
      </span>
    ),
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
