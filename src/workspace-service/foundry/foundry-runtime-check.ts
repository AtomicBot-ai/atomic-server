/** Checks a resolved model revision and translates the core's verdict into a download blocker. */
import { AtomicCoreError } from '@atomic-chat/core'
import type {
  EngineVersionsResponse,
  FoundryLocalCheckRequest,
  FoundryLocalCheckResult,
} from '@atomic-chat/core/contracts'
import type { CoreLink } from '../../core-link/index.js'
import { AtcError } from '../../errors/index.js'

const CHECK = '/models/foundry-local/check'
const UNKNOWN_MINIMUM = 'The request has fields this core does not know: min_runtime_version.'
const INSTALL = 'atc engines install foundry-local'

export const FOUNDRY_HINTS: Readonly<Record<string, string>> = {
  'accelerator-not-prepared': 'atc engines accelerators foundry-local --prepare',
  'engine-not-installed': INSTALL,
}

function versionParts(version: string) {
  if (version === version.trim() && /^\d+\.\d+\.\d+$/.test(version))
    return version.split('.').map((part) => BigInt(part))
}

function meetsMinimum(version: string | undefined, minimum: string) {
  const actual = versionParts(version?.replace(/^v/, '') ?? '')
  const required = versionParts(minimum)
  if (!actual || !required) return undefined
  const difference = actual.findIndex((part, i) => part !== required[i])
  return difference < 0 || actual[difference]! > required[difference]!
}

/** A fresh SAS response can omit a requirement already discovered for this revision. */
export function foundryRuntimeMinimum(value: unknown, previous?: string): string | undefined {
  if (typeof value !== 'string' || !versionParts(value)?.some((part) => part > 0n)) return previous
  return previous && meetsMinimum(previous, value) ? previous : value
}

export async function checkFoundryRuntime(
  link: CoreLink,
  variant: { execution_provider: string; device: string },
  minimum?: string,
  catalogVerdict?: FoundryLocalCheckResult
): Promise<{ verdict: FoundryLocalCheckResult; blocker?: string; updateAvailable?: boolean }> {
  const request = { execution_provider: variant.execution_provider, device: variant.device }
  const check = (body: FoundryLocalCheckRequest) => link.request<FoundryLocalCheckResult>('POST', CHECK, body)
  const versions = async () => {
    const response = await link.request<EngineVersionsResponse>('POST', '/engines/versions', {})
    return response.engines?.find((engine) => engine.engine === 'foundry-local')
  }
  let builds: Awaited<ReturnType<typeof versions>>
  let verdict: FoundryLocalCheckResult
  try {
    verdict = minimum
      ? await check({ ...request, min_runtime_version: minimum })
      : (catalogVerdict ?? (await check(request)))
  } catch (error) {
    if (
      !minimum ||
      !(error instanceof AtomicCoreError) ||
      error.code !== 'INVALID_ARGUMENT' ||
      error.message !== UNKNOWN_MINIMUM
    )
      throw error
    verdict = await check(request)
    if (verdict.verdict !== 'engine-not-installed' && verdict.verdict !== 'platform-unsupported') {
      builds = await versions().catch(() => undefined)
      const active = builds?.active?.version
      const compatible = meetsMinimum(active, minimum)
      if (compatible === undefined)
        throw new AtcError(
          'ATC_USAGE',
          `A newer Atomic Chat core is needed to verify the Foundry Local runtime requirement (${minimum} or newer).`
        )
      if (!compatible)
        verdict = {
          ...verdict,
          verdict: 'engine-update-required',
          reason: `Foundry Local ${active?.replace(/^v/, '')} is active; this model requires ${minimum} or newer.`,
        }
    }
  }
  if (verdict.verdict === 'ok') return { verdict }
  const reason = verdict.reason ?? verdict.verdict
  if (verdict.verdict !== 'engine-update-required') {
    const hint = FOUNDRY_HINTS[verdict.verdict]
    return { verdict, blocker: hint ? `${reason} (${hint})` : reason }
  }

  // The core can impose a higher minimum for an accelerator. Its current wire result reports that
  // minimum in the reason. Require the published format before offering an update on that basis.
  const required = foundryRuntimeMinimum(
    /; this model requires (\d+\.\d+\.\d+) or newer\.$/.exec(reason)?.[1],
    minimum
  )
  builds ??= await versions().catch(() => undefined)
  const latest = builds?.latest?.version
  const updateAvailable = required !== undefined && meetsMinimum(latest, required) === true
  const sourceUnavailable = !builds || builds.error || builds.source_error
  return {
    verdict,
    updateAvailable,
    blocker: updateAvailable
      ? `${reason} (${INSTALL})`
      : `${reason} ${sourceUnavailable ? 'Could not determine whether a compatible Foundry Local update is available.' : 'No compatible Foundry Local update is available for this host.'}`,
  }
}
