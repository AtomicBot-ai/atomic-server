import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { strataSourceDigest } from '@atomic-chat/core/client'
import type { StrataModelDescriptor } from '@atomic-chat/core/contracts'
import { AtcError } from '../../errors/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { strataCatalog } from './catalog.js'

export async function strataPlan(
  options: WorkspaceServiceOptions,
  model: string,
  refresh = false,
  importDirectory?: string
) {
  if (importDirectory && !isAbsolute(importDirectory))
    throw new AtcError('ATC_USAGE', 'Use an absolute Strata import directory on the server.')
  const normalized = model.replace(/^strata\//, '')
  const { rows } = await strataCatalog(options, normalized, refresh)
  const row = rows.find(({ id }) => id === normalized)
  if (!row) throw new AtcError('ATC_USAGE', 'Choose a variant from atc models catalog --engine strata.')
  const { descriptor, check } = row.source
  const source_digest = await strataSourceDigest(descriptor)
  const blockers: string[] = []
  if (check.verdict !== 'ok' && check.verdict !== 'engine-not-installed')
    blockers.push(check.reason ?? check.verdict)
  if (!importDirectory && descriptor.gated && !options.env?.['HF_TOKEN'])
    blockers.push('Accept the model license and set HF_TOKEN on the server.')
  return {
    digest: strataPlanDigest(source_digest, importDirectory),
    source_digest,
    model_id: descriptor.variant_id,
    variant_id: descriptor.variant_id,
    name: descriptor.name,
    descriptor,
    check,
    capabilities: check.capabilities ?? descriptor.capabilities,
    context_length: descriptor.context_length,
    license: descriptor.license,
    variant: { backend: check.compatible_devices?.[0]?.backend ?? '', verdict: check },
    download_bytes: importDirectory ? 0 : descriptor.requirements.download_bytes,
    blockers,
    ...(importDirectory ? { import_directory: importDirectory } : {}),
  }
}

export const strataPlanDigest = (sourceDigest: string, importDirectory?: string) =>
  createHash('sha256')
    .update(JSON.stringify([sourceDigest, importDirectory ?? null]))
    .digest('hex')

export type StrataPlan = Awaited<ReturnType<typeof strataPlan>>

export function verifyStrataPlan(plan: StrataPlan, descriptor: StrataModelDescriptor, digest: string) {
  if (
    descriptor.variant_id !== plan.model_id ||
    digest !== plan.source_digest ||
    plan.digest !== strataPlanDigest(digest, plan.import_directory) ||
    (plan.import_directory && !isAbsolute(plan.import_directory))
  )
    throw new Error('The saved Strata model plan no longer matches its pinned inputs.')
}
