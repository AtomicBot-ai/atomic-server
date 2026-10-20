/**
 * Models for the managed engines (spec `managed-models-server`): the verdict of each managed engine
 * on a Hugging Face checkpoint before anything is downloaded. The repository is read here (design D7,
 * `hf-revision.ts`); the verdict is only ever the core's (`POST /models/<engine>/check`, which reads
 * the network on no side). The core keeps each provider's settings itself (`atc config engine.*`
 * writes them there), so its verdict already follows the chosen card and context length.
 */

import { AtomicCoreError, ENGINE_KINDS } from '@atomic-chat/core/contracts'
import type {
  EngineVersionsResponse,
  EnvironmentSnapshot,
  ModelCompatibility,
} from '@atomic-chat/core/contracts'
import type { ManagedVerdict, ModelCheckResult } from '../contract/index.js'
import type { CoreLink } from '../core-link/index.js'
import { orderEngines } from '../workspace-view/index.js'
import { AtcError } from '../errors/index.js'
import { checkRequestFor, fetchHfRevision, HF_HUB, normalizeRepository } from './hf-revision.js'
import type { HfRevision } from './hf-revision.js'
import { segment } from './validation.js'

export interface ManagedModelDeps {
  link: CoreLink
  fetch: typeof fetch
  /** The server's environment: `HF_TOKEN` for gated repositories, `HF_ENDPOINT` for a Hub mirror. */
  env?: Record<string, string | undefined> | undefined
}

/** The Hub the server reads: `HF_ENDPOINT` when set, as the Hugging Face tools read it. */
export const hubOf = (env: ManagedModelDeps['env']) => (env?.['HF_ENDPOINT'] || HF_HUB).replace(/\/+$/, '')

/** The managed engines the core registers on this host, in its order, and which are installed. */
export async function managedEngines(link: CoreLink): Promise<Array<{ engine: string; installed: boolean }>> {
  const { engines } = await link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
  const environment = ((await link.environments.list()) as EnvironmentSnapshot[])[0]
  const order = orderEngines((engines ?? []).map((e) => e.engine as string))
  return order
    .map((id) => (engines ?? []).find((e) => e.engine === id)!)
    .filter((e) => ENGINE_KINDS[e.engine] === 'managed')
    .map((e) => ({
      engine: e.engine,
      installed: (environment?.installations ?? []).some(
        (i) => i.engine_id === e.engine && i.status === 'ready'
      ),
    }))
}

/** `owner/repo` or `owner/repo@revision`, as a person writes it, URL or not. */
export function parseModelRef(value: string): { repository: string; revision?: string } {
  const at = value.lastIndexOf('@')
  const repository = normalizeRepository(at > 0 ? value.slice(0, at) : value)
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository))
    throw new AtcError('ATC_USAGE', `Name a Hugging Face repository as owner/repo: ${value}`)
  return at > 0 ? { repository, revision: value.slice(at + 1) } : { repository }
}

export async function readRevision(
  d: ManagedModelDeps,
  repository: string,
  revision?: string
): Promise<HfRevision> {
  return fetchHfRevision(repository, revision, {
    token: d.env?.['HF_TOKEN'],
    fetch: d.fetch,
    hub: hubOf(d.env),
  })
}

/** Each engine's verdict on a revision already read; an engine that cannot answer keeps its error. */
export async function verdicts(
  link: CoreLink,
  meta: HfRevision,
  engines: Array<{ engine: string; installed: boolean }>
): Promise<ManagedVerdict[]> {
  const body = checkRequestFor(meta)
  const result: ManagedVerdict[] = []
  for (const { engine, installed } of engines) {
    try {
      const compatibility = await link.request<ModelCompatibility>(
        'POST',
        `/models/${segment(engine)}/check`,
        body
      )
      result.push({ engine, installed, compatibility, error: null })
    } catch (error) {
      if (!(error instanceof AtomicCoreError)) throw error
      result.push({ engine, installed, compatibility: null, error: error.toJSON() })
    }
  }
  return result
}

/** `models.check {repository, revision?, engine?}`. */
export async function checkModel(
  d: ManagedModelDeps,
  input: { repository: string; revision?: string; engine?: string }
): Promise<ModelCheckResult> {
  const ref = parseModelRef(input.revision ? `${input.repository}@${input.revision}` : input.repository)
  const registered = await managedEngines(d.link)
  if (input.engine && ENGINE_KINDS[input.engine as keyof typeof ENGINE_KINDS] !== 'managed')
    throw new AtcError('ATC_USAGE', `${input.engine} is not a managed engine.`)
  const asked = input.engine ? registered.filter((e) => e.engine === input.engine) : registered
  if (asked.length === 0)
    throw new AtcError(
      'ATC_USAGE',
      input.engine
        ? `${input.engine} is not available on this platform.`
        : 'The core offers no managed engine on this machine.'
    )
  const meta = await readRevision(d, ref.repository, ref.revision)
  return {
    repository: meta.repository,
    revision: meta.revision,
    verdicts: await verdicts(d.link, meta, asked),
  }
}
