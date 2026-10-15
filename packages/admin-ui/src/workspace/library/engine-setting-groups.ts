import { record, text } from '../types'
import type { RecordValue } from '../types'
export const SETTING_GROUPS = [
  'Common',
  'Memory & context',
  'Concurrency',
  'Hardware',
  'Speculative decoding',
  'Advanced',
  'All',
]
export function settingGroup(field: RecordValue): string {
  const key = text(field.key).toLowerCase()
  if (/mtp|dflash|draft|speculat/.test(key)) return 'Speculative decoding'
  if (/concurrent|parallel|batch|metrics/.test(key)) return 'Concurrency'
  if (/ctx|context|cache|mmap|mlock|rope|fit|memory/.test(key)) return 'Memory & context'
  if (/gpu|device|thread|flash|split|offload/.test(key)) return 'Hardware'
  return 'Advanced'
}
export function commonSetting(field: RecordValue): boolean {
  return /^(version_backend|ctx_size|context_size|fit|concurrent_mode|parallel|threads|gpu_layers|n_gpu_layers|flash_attn|max_tokens|num_ctx|temperature|memory_limit)$/.test(
    text(field.key)
  )
}
export function inactiveSetting(field: RecordValue, values: RecordValue): string {
  const key = text(field.key)
  if (key.startsWith('dflash_') && !values.dflash) return 'Enable DFlash to use this setting.'
  if (key === 'concurrent_slots' && !values.concurrent_mode)
    return 'Enable Concurrent Mode to use this setting.'
  if (['parallel', 'cont_batching'].includes(key) && values.concurrent_mode)
    return 'Managed by Concurrent Mode.'
  if (key.startsWith('fit_') && values.fit === false)
    return 'Enable automatic memory fitting to use this setting.'
  return ''
}
export function descriptorDefault(field: RecordValue) {
  return record(field.controllerProps).value
}
