import type { SettingDescriptor } from '@atomic-chat/core/contracts'
import { gpuLabel } from '../../../workspace-view/index.js'
import type { EnginePanel } from './engine-panel-model.js'

export function engineSettingOptions(p: EnginePanel, descriptor: SettingDescriptor) {
  if (descriptor.key === 'gpu_id' && p.kind === 'managed')
    return [
      { value: '', label: 'Card with the most free memory' },
      ...(p.form?.gpus ?? []).map((gpu) => ({ value: gpu.gpu_id, label: gpuLabel(gpu) })),
    ]
  const options = descriptor.controllerProps['options']
  return descriptor.controllerType === 'dropdown' && Array.isArray(options)
    ? options.map((item: unknown) =>
        typeof item === 'object' && item !== null
          ? {
              value: (item as { value: unknown }).value,
              label: String(
                (item as { label?: unknown; value: unknown }).label ?? (item as { value: unknown }).value
              ),
            }
          : { value: item, label: String(item) }
      )
    : []
}
