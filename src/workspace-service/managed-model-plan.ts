/**
 * What downloading a Hugging Face checkpoint into the managed engines' shared store would do (design
 * D6): the revision pinned and read, the engine's verdict (the only one that can allow the download),
 * where the core keeps the store and how much room it says there is, which files are still missing,
 * and whether that very revision is already there.
 */

import { createHash } from 'node:crypto'
import { AtomicCoreError } from '@atomic-chat/core'
import type { ManagedModelLocation } from '@atomic-chat/core/contracts'
import type { ManagedModelPlan } from '../contract/index.js'
import { AtcError } from '../errors/index.js'
import { formatSize } from '../workspace-view/index.js'
import type { ManagedModelDeps } from './managed-models.js'
import { managedEngines, parseModelRef, readRevision, verdicts } from './managed-models.js'

/** The store's files as this server sees them; the seam for a store on another file system. */
export interface StoreFiles {
  /** Bytes of a file, `null` when it is not there. */
  size(path: string): Promise<number | null>
  readText(path: string): Promise<string | undefined>
  /** Write beside the target, then rename over it: a reader never sees half a file. */
  writeAtomic(path: string, text: string): Promise<void>
}

/** `relative` (`/`-separated) under `root`, with the root's own separator: a UNC root gets backslashes. */
export function underRoot(root: string, ...relative: string[]): string {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  const tail = relative.join('/').split('/').filter(Boolean).join(separator)
  return `${root.replace(/[\\/]+$/, '')}${separator}${tail}`
}

/** The revision `model.yml` records, in the app's YAML or `atc`'s JSON. */
export function recordedRevision(text: string): string | undefined {
  return /^\s*"?revision"?\s*:\s*"?([0-9a-f]{40})"?/m.exec(text)?.[1]
}

async function location(d: ManagedModelDeps, engine: string): Promise<ManagedModelLocation> {
  try {
    return await d.link.request<ManagedModelLocation>('GET', '/managed-models/location')
  } catch (error) {
    if (
      error instanceof AtomicCoreError &&
      (error.code === 'MANAGED_ADAPTER_UNAVAILABLE' || error.code === 'PROVIDER_NOT_FOUND')
    )
      throw new AtcError('ATC_USAGE', 'The managed engines have no model store on this machine yet.', {
        details: error.message,
        hint: `install the engine first: atc engines install ${engine}`,
      })
    throw error
  }
}

export async function managedModelPlan(
  d: ManagedModelDeps & { files: StoreFiles },
  input: { repository: string; revision?: string; engine: string }
): Promise<ManagedModelPlan> {
  const ref = parseModelRef(input.revision ? `${input.repository}@${input.revision}` : input.repository)
  const engine = (await managedEngines(d.link)).find((e) => e.engine === input.engine)
  if (!engine)
    throw new AtcError('ATC_USAGE', `${input.engine} is not a managed engine available on this machine.`)
  const meta = await readRevision(d, ref.repository, ref.revision)
  const [verdict] = await verdicts(d.link, meta, [engine])
  const { root, free_bytes } = await location(d, engine.engine)
  const dir = (path: string) => underRoot(root, meta.repository, path)
  const sizes = await Promise.all(meta.files.map((f) => d.files.size(dir(f.path))))
  const complete = meta.files.map((f, i) => sizes[i] === f.size)
  const yml = await d.files.readText(dir('model.yml'))
  const present = yml !== undefined && recordedRevision(yml) === meta.revision && complete.every(Boolean)
  const pending = present ? [] : meta.files.filter((_, i) => !complete[i]).map((f) => f.path)
  const downloadBytes = meta.files.filter((f) => pending.includes(f.path)).reduce((a, f) => a + f.size, 0)
  const blockers: string[] = []
  const c = verdict!.compatibility
  if (!c) blockers.push(`${engine.engine}: ${verdict!.error?.message ?? 'no verdict'}`)
  else if (!c.verdict.ok) blockers.push(`${engine.engine}: ${c.verdict.error.message}`)
  if (free_bytes !== null && downloadBytes > free_bytes)
    blockers.push(
      `Not enough free space in ${root}: ${formatSize(downloadBytes)} needed, ${formatSize(free_bytes)} free.`
    )
  const config = (meta.config_json ?? {}) as { architectures?: unknown }
  const architectures =
    c?.architectures ?? (Array.isArray(config.architectures) ? config.architectures.map(String) : [])
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        repository: meta.repository,
        revision: meta.revision,
        engine: engine.engine,
        root,
        files: meta.files,
      })
    )
    .digest('hex')
  return {
    digest,
    repository: meta.repository,
    revision: meta.revision,
    engine: engine.engine,
    architectures,
    root,
    files: meta.files,
    pending,
    download_bytes: downloadBytes,
    free_bytes,
    verdict: verdict!,
    present,
    blockers,
  }
}
