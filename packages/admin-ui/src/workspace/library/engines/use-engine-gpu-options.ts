import { useEffect, useState } from 'react'
import type { EngineBuildCatalog, GpuFacts, HardwareInfoResponse } from '@atomic-chat/core/contracts'
import { engineFamily } from '@view'
import { rows, type Execute } from '../../types'

export type StrataGpuOption = { id: string; label: string }

function useStrataGpuOptions(execute: Execute, enabled: boolean) {
  const [gpus, setGpus] = useState<StrataGpuOption[]>([])
  useEffect(() => {
    if (!enabled) return
    let active = true
    void Promise.all([
      execute<HardwareInfoResponse>('hardware.info'),
      execute<EngineBuildCatalog>('engines.catalog', { engine: 'strata' }).catch(() => null),
    ]).then(
      ([hardware, catalog]) => {
        if (!active || !hardware?.info) return
        const { cpu, gpus, os_type: os } = hardware.info
        const backend = catalog?.active?.backend_id ?? catalog?.host_backend_id
        if (backend === 'macos-arm64-metal' || (os === 'macos' && ['arm64', 'aarch64'].includes(cpu.arch))) {
          setGpus([{ id: 'apple:0', label: cpu.name || 'Apple GPU' }])
          return
        }
        const vendor = backend?.includes('cuda')
          ? 'nvidia'
          : backend?.includes('sycl')
            ? 'intel'
            : backend
              ? 'amd'
              : ''
        const choices = new Map<string, StrataGpuOption>()
        for (const gpu of gpus) {
          const kind = gpu.vendor.toLowerCase()
          if (!gpu.uuid || !['nvidia', 'amd', 'intel'].includes(kind) || (vendor && vendor !== kind)) continue
          const id =
            kind === 'nvidia' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(gpu.uuid)
              ? `GPU-${gpu.uuid}`
              : gpu.uuid
          choices.set(id, { id, label: gpu.name || id })
        }
        setGpus([...choices.values()])
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [enabled, execute])
  return gpus
}

export function useEngineGpuOptions(execute: Execute, provider: string) {
  const [gpus, setGpus] = useState<GpuFacts[]>([])
  const strataGpus = useStrataGpuOptions(execute, provider === 'strata')
  useEffect(() => {
    if (engineFamily(provider) !== 'managed') return
    void execute('environments.list').then(
      (list) => setGpus((rows(list)[0]?.gpus as GpuFacts[]) ?? []),
      () => {}
    )
  }, [provider, execute])
  return { gpus, strataGpus }
}
