/**
 * `atc models list` and `atc models rm`: every installed model once, with the providers that list it
 * and its size where known; a model of the managed engines' shared store is removed through the core,
 * which stops it first, after saying that it goes for every managed engine; a Foundry Local variant is
 * listed with its accelerator and device, a LiteRT-LM variant with its backend, and either is removed by
 * the server, which unloads it first.
 */

import { AtomicCoreError } from '@atomic-chat/core'
import type { ManagedModelDeletion } from '@atomic-chat/core/contracts'
import type { CommandContext } from '../../cli/index.js'
import { formatSize, liteRtVariantLabel, variantLabel } from '../../workspace-view/index.js'
import { workspace } from '../server/control.js'

interface InstalledRow {
  id: string
  provider: string
  providers?: string[]
  store?: string
  size_bytes?: number
  device?: string
  execution_provider?: string
  backend?: string
  npu?: string
}

const providersOf = (m: InstalledRow) =>
  m.store === 'foundry-local' && m.device && m.execution_provider
    ? `foundry-local (${variantLabel({ device: m.device, execution_provider: m.execution_provider })})`
    : m.store === 'litert-lm' && m.backend
      ? `litert-lm (${liteRtVariantLabel({ backend: m.backend, npu: m.npu })})`
      : (m.providers ?? [m.provider]).join(', ') || '(none lists it)'

export async function listInstalled(ctx: CommandContext): Promise<number> {
  const result = (await (await workspace(ctx)).execute('models.installed')) as InstalledRow[]
  const envelope = { schema_version: 1, operation: 'models.installed', status: 'ok', result }
  ctx.out.result(envelope, () =>
    ctx.out.table(
      [{ header: 'MODEL' }, { header: 'PROVIDERS' }, { header: 'SIZE', align: 'right' }],
      result.map((m) => [m.id, providersOf(m), m.size_bytes !== undefined ? formatSize(m.size_bytes) : ''])
    )
  )
  return 0
}

export async function removeInstalled(ctx: CommandContext, id: string): Promise<number> {
  const service = await workspace(ctx)
  const row = ((await service.execute('models.installed')) as InstalledRow[]).find((m) => m.id === id)
  if (row?.store === 'managed')
    ctx.io.stderr(
      `${id} is in the managed engines' shared store: removing it removes it for every managed engine (${(row.providers ?? []).join(', ')}), loaded or not.\n`
    )
  if (!(await ctx.prompt.confirm(`Delete model ${id}?`, { danger: true }))) return 0
  let result: unknown
  try {
    result = await service.execute('models.remove', { model_id: id })
  } catch (error) {
    if (error instanceof AtomicCoreError && error.code === 'MANAGED_STOP_UNCONFIRMED')
      throw AtomicCoreError.fromBody({
        code: error.code,
        message: `${error.message} The model's files were not touched.`,
        ...(error.details !== undefined ? { details: error.details } : {}),
      })
    throw error
  }
  const deletion =
    row?.store && ['managed', 'foundry-local', 'litert-lm'].includes(row.store)
      ? (result as ManagedModelDeletion)
      : undefined
  ctx.out.result(result, () =>
    ctx.out.line(
      deletion
        ? `Removed ${id}${deletion.was_loaded ? ' (unloaded first)' : ''}; freed ${formatSize(deletion.freed_bytes)}.`
        : `Removed ${id}.`
    )
  )
  return 0
}
