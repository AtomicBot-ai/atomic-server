/** Looking up `atc` releases on GitHub. The installers default to the same repository. */

import { AtcError } from '../errors/index.js'
import { isNewer, parseSemver } from './semver.js'

export const ATC_REPO = 'AtomicBot-ai/eye-cli'

export interface ReleaseInfo {
  version: string
  tag: string
  url: string
  assets: Array<{ name: string; url: string; size: number }>
}

export const GITHUB_API = 'https://api.github.com'

export interface ReleaseQuery {
  repo?: string
  /** A tag (`v1.2.3` or `1.2.3`); the latest release when absent. */
  tag?: string
  /** The API's base URL; `ATC_GITHUB_API` points it at a mirror or a test server. */
  api?: string
}

export async function fetchRelease(fetchImpl: typeof fetch, query: ReleaseQuery = {}): Promise<ReleaseInfo> {
  const repo = query.repo ?? ATC_REPO
  const api = (query.api ?? GITHUB_API).replace(/\/+$/, '')
  const tag = query.tag ? (query.tag.startsWith('v') ? query.tag : `v${query.tag}`) : undefined
  const url = `${api}/repos/${repo}/releases/${tag ? `tags/${encodeURIComponent(tag)}` : 'latest'}`
  let res: Response
  try {
    res = await fetchImpl(url, { headers: { 'accept': 'application/vnd.github+json', 'user-agent': 'atc' } })
  } catch (error) {
    throw new AtcError('ATC_UPDATE_FAILED', 'Could not reach GitHub.', { details: (error as Error).message })
  }
  if (res.status === 404)
    throw new AtcError(
      'ATC_UPDATE_FAILED',
      tag ? `There is no release ${tag}.` : 'No release has been published yet.'
    )
  if (!res.ok) throw new AtcError('ATC_UPDATE_FAILED', `GitHub answered ${res.status}.`)
  const body = (await res.json()) as {
    tag_name?: string
    html_url?: string
    assets?: Array<{ name: string; browser_download_url: string; size: number }>
  }
  const found = body.tag_name ?? ''
  if (!parseSemver(found)) throw new AtcError('ATC_UPDATE_FAILED', `Unexpected release tag '${found}'.`)
  return {
    version: found.replace(/^v/, ''),
    tag: found,
    url: body.html_url ?? `https://github.com/${repo}/releases/tag/${found}`,
    assets: (body.assets ?? []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
  }
}

export function fetchLatestRelease(
  fetchImpl: typeof fetch,
  repo = ATC_REPO,
  api?: string
): Promise<ReleaseInfo> {
  return fetchRelease(fetchImpl, { repo, ...(api ? { api } : {}) })
}

export interface UpdateCheck {
  current: string
  latest: string
  available: boolean
  url: string
}

export async function checkForUpdate(
  fetchImpl: typeof fetch,
  current: string,
  repo = ATC_REPO,
  api?: string
): Promise<UpdateCheck> {
  const latest = await fetchLatestRelease(fetchImpl, repo, api)
  return { current, latest: latest.version, available: isNewer(latest.version, current), url: latest.url }
}
