import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { parseFastFlowLmDescriptor, projectFastFlowLmCollection } from '@atomic-chat/core/client'
import type { FastFlowLmCheckResult } from '@atomic-chat/core/contracts'
import { AtcError } from '../../errors/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { unifiedCatalog } from '../models/unified-catalog.js'

export async function flmCatalog(o: WorkspaceServiceOptions, query = '', force = false) {
  const result = await unifiedCatalog(
    o.paths.cacheDir,
    o.fetch ?? fetch,
    force,
    o.env?.ATC_MODEL_CATALOG_URL ?? o.env?.ATOMIC_MODEL_CATALOG_URL
  )
  const catalogDigest = createHash('sha256').update(JSON.stringify(result.catalog)).digest('hex')
  const definitions = projectFastFlowLmCollection(result.catalog).models.filter((d) =>
    `${d.name} ${d.model_id} ${d.variant_id}`.toLowerCase().includes(query.toLowerCase())
  )
  const entries = await Promise.all(
    definitions.map(async (d) => {
      const record = parseFastFlowLmDescriptor(d)
      const verdict = await o.link.request<FastFlowLmCheckResult>('POST', '/models/fastflowlm/check', {
        descriptor: record,
      })
      const summary = `${d.recommended ? 'Recommended · ' : ''}${d.license} · Context ${d.context_length} · Tools ${d.capabilities.tools ? 'yes' : 'no'} · Reasoning ${d.capabilities.reasoning ? 'yes' : 'no'} · Structured output ${d.capabilities.structured_output ? 'yes' : 'no'}`
      return {
        model_id: d.model_id,
        name: d.name,
        summary,
        license: d.license,
        gated: d.gated,
        context_length: d.context_length,
        ...d.capabilities,
        vision: false,
        origin: 'curated',
        unverified: d.qualification.status !== 'qualified',
        recommended: d.recommended === true,
        default_variant: d.variant_id,
        variants: [
          {
            id: d.variant_id,
            summary,
            license: d.license,
            gated: d.gated,
            context_length: d.context_length,
            ...d.capabilities,
            backend: 'npu',
            record,
            size_bytes: record.files.reduce((n, f) => n + f.size, 0),
            verdict,
          },
        ],
      }
    })
  )
  const groups = new Map<string, (typeof entries)[number]>()
  for (const entry of entries) {
    const prior = groups.get(entry.model_id)
    if (prior) prior.variants.push(...entry.variants)
    else groups.set(entry.model_id, entry)
  }
  const models = [...groups.values()].sort((a, b) => Number(b.recommended) - Number(a.recommended))
  for (const model of models)
    model.default_variant =
      model.variants.find((v) => v.verdict.verdict === 'ok')?.id ?? model.default_variant
  return {
    models,
    catalog_digest: catalogDigest,
    list_source: result.source,
    list_error: result.error ?? null,
  }
}
export async function flmPlan(o: WorkspaceServiceOptions, model: string, refresh = false, selected?: string) {
  const catalog = await flmCatalog(o, '', refresh)
  const row = catalog.models.find(
    (r) =>
      (r.model_id === model || r.variants.some((v) => v.id === model)) &&
      (!selected || r.variants.some((v) => v.id === selected))
  )
  if (!row)
    throw new AtcError('ATC_USAGE', 'Choose a FastFlowLM model from atc models catalog --engine fastflowlm.')
  const variant =
    row.variants.find((v) => v.id === (selected ?? model)) ??
    row.variants.find((v) => v.id === row.default_variant)!
  const { record } = variant
  const blockers: string[] = []
  if (variant.verdict.verdict !== 'ok') blockers.push(variant.verdict.reason ?? variant.verdict.verdict)
  if (variant.gated && !o.env?.HF_TOKEN)
    blockers.push('Accept the model license at Hugging Face and set HF_TOKEN on the server.')
  const free = await o.link.disk.available(o.paths.layout.provider('fastflowlm').modelsDir)
  if (free !== null && free < variant.size_bytes)
    blockers.push('Not enough free space for the staged model; the installed version is preserved.')
  const identity = { record, catalog_digest: catalog.catalog_digest }
  return {
    ...identity,
    digest: createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
    model_id: record.model_id,
    variant_id: record.variant_id,
    name: row.name,
    context_length: record.context_length,
    capabilities: record.capabilities,
    license: variant.license,
    gated: variant.gated,
    variant,
    download_bytes: variant.size_bytes,
    free_bytes: free,
    blockers,
    dir: join(o.paths.layout.provider('fastflowlm').modelsDir, record.variant_id),
  }
}
export type FlmPlan = Awaited<ReturnType<typeof flmPlan>>
