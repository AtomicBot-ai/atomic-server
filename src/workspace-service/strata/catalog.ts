import { projectStrataCollection } from '@atomic-chat/core/client'
import type {
  EngineBuildCatalog,
  StrataCheckResult,
  StrataModelDescriptor,
} from '@atomic-chat/core/contracts'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { unifiedCatalog } from '../models/unified-catalog.js'

const recommendedQwen = 'iq3-xxs-dflash2'
const defaults = new Set([recommendedQwen, 'ud-q4-k-xl-mtp', 'ista-2-00bpw-dspark'])

export async function strataCatalogSource(options: WorkspaceServiceOptions, refresh: boolean) {
  const result = await unifiedCatalog(
    options.paths.cacheDir,
    options.fetch ?? fetch,
    refresh,
    options.env?.['ATC_MODEL_CATALOG_URL']
  )
  return { ...result, descriptors: projectStrataCollection(result.catalog).models }
}

export async function checkStrataVariant(
  { link }: WorkspaceServiceOptions,
  descriptor: StrataModelDescriptor
) {
  const check = await link.request<StrataCheckResult>('POST', '/models/strata/check', { descriptor })
  return {
    id: descriptor.variant_id,
    name: descriptor.name,
    category: 'text' as const,
    description: check.reason ?? '',
    source: { provider: 'strata', format: 'strata', descriptor, check },
  }
}

function groupKey({ family, variant_id: id }: StrataModelDescriptor) {
  const release = family === 'qwen38' ? /^(unsloth|swift|coder|gyro|nvfp4)-/.exec(id)?.[1] : undefined
  return release ? `${family}/${release}` : family
}

const quantSuffix =
  /(?:UD-)?(?:IQ|Q)\d[\w-]+$|Gyro-\w+$|NVFP4(?:[ -]\w+)?$|(?:ISTA-DAS )?(?:\d+\.\d+ bpw|Coder)$/i
function quantName({ name, family }: StrataModelDescriptor) {
  const suffix = name.match(quantSuffix)?.[0]
  if (family === 'deepseek41' && suffix?.startsWith('UD-')) return `Unsloth ${suffix}`
  return suffix ?? name
}

export async function strataCatalog(options: WorkspaceServiceOptions, query: string, refresh: boolean) {
  const [result, builds] = await Promise.all([
    strataCatalogSource(options, refresh),
    options.link.request<EngineBuildCatalog>(
      'POST',
      '/engine-builds/strata/catalog',
      refresh ? { force: true } : {}
    ),
  ])
  const backend = builds.active?.backend_id ?? builds.host_backend_id
  const groups = new Map<string, StrataModelDescriptor[]>()
  for (const descriptor of result.descriptors) {
    if (!backend || !descriptor.compatible_variants.includes(backend)) continue
    const key = groupKey(descriptor)
    const group = groups.get(key)
    if (group) group.push(descriptor)
    else groups.set(key, [descriptor])
  }
  const search = query.trim().toLowerCase()
  const visible = [...groups.values()].filter((group) =>
    group.some(({ name, family, variant_id }) =>
      `${name} ${family} strata/${variant_id}`.toLowerCase().includes(search)
    )
  )
  const checked = await Promise.all(
    visible.map((group) => Promise.all(group.map((descriptor) => checkStrataVariant(options, descriptor))))
  )
  const models = checked.map((group) => {
    const primary = group.find(({ id }) => defaults.has(id)) ?? group[0]!
    const { descriptor, check } = primary.source
    const recommended = backend === 'macos-arm64-metal' && primary.id === recommendedQwen
    return {
      model_id: primary.id,
      name: primary.name,
      default_variant: primary.id,
      license: descriptor.license,
      gated: descriptor.gated,
      context_length: descriptor.context_length,
      ...(check.capabilities ?? descriptor.capabilities),
      recommended,
      summary: check.verdict === 'insufficient-disk' ? check.reason : null,
      variants: group.map(({ id, source: { descriptor, check } }) => ({
        id,
        label: quantName(descriptor),
        size_bytes: descriptor.requirements.download_bytes,
        summary: check.reason ?? '',
        context_length: descriptor.context_length,
        ...(check.capabilities ?? descriptor.capabilities),
        verdict: check,
      })),
    }
  })
  return {
    rows: checked.flat(),
    models: models.sort((a, b) => Number(b.recommended) - Number(a.recommended)),
    cached: result.source !== 'remote',
    updated_at: result.fetchedAt ?? 0,
    ...(result.error ? { error: result.error } : {}),
  }
}
