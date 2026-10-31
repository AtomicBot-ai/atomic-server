/**
 * Replace the running `atc` with a release: find it, download the asset of this binary's own target
 * beside the executable (same file system, so the final rename is atomic), check it against
 * `SHA256SUMS`, its signature against the installed one's, and its `--version`, then swap it in with
 * `planReplace`. Restarting the server or the service is the command's job. Every failure before the
 * swap leaves the installed binary untouched and removes the download.
 */

import { basename, dirname, join } from 'node:path'
import { AtcError } from '../errors/index.js'
import type { ExecFn } from '../host/index.js'
import { parseSha256Sums } from './checksums.js'
import { installLabel, packageUpgradeHint } from './install-source.js'
import type { InstallSource } from './install-source.js'
import { fetchRelease } from './release.js'
import type { ReleaseInfo, ReleaseQuery } from './release.js'
import { assetNameFor, planReplace } from './replace-plan.js'
import type { ReplacePlan } from './replace-plan.js'
import { isNewer } from './semver.js'
import { trustDowngrade, trustOf } from './trust.js'

export interface UpdateFiles {
  /** Write the response body to `path` and return its SHA-256 (lowercase hex). */
  download(url: string, path: string): Promise<string>
  rename(from: string, to: string): Promise<void>
  chmod(path: string, mode: number): Promise<void>
  remove(path: string): Promise<void>
  list(dir: string): Promise<string[]>
}

export interface ApplyDeps {
  fetch: typeof fetch
  exec: ExecFn
  files: UpdateFiles
  platform: NodeJS.Platform
  arch: string
  /** The running binary. */
  execPath: string
  /** The triple baked into this binary; undefined when it runs from source. */
  builtFor: string | undefined
  /** The package that installed this binary (`readInstallSource`); its package manager updates it. */
  installSource?: InstallSource | undefined
  currentVersion: string
  now: () => Date
}

export interface ApplyResult {
  updated: boolean
  from: string
  to: string
  path: string
  release: Pick<ReleaseInfo, 'tag' | 'url'>
}

/** Run each step; on Windows a failed second rename puts the moved-aside binary back. */
export async function executeReplace(plan: ReplacePlan, files: UpdateFiles): Promise<void> {
  const done: Array<{ from: string; to: string }> = []
  for (const step of plan.steps) {
    if (step.op === 'chmod') await files.chmod(step.path, step.mode)
    else if (step.op === 'rename') {
      try {
        await files.rename(step.from, step.to)
        done.push({ from: step.from, to: step.to })
      } catch (error) {
        for (const r of done.reverse()) await files.rename(r.to, r.from).catch(() => undefined)
        throw new AtcError(
          'ATC_UPDATE_FAILED',
          'Could not put the new binary in place; the installed one is unchanged.',
          {
            details: (error as Error).message,
          }
        )
      }
    } else {
      // Moved-aside binaries of earlier updates; the one still running cannot be removed yet.
      const prefix = basename(step.glob.replace(/\*$/, ''))
      const dir = dirname(step.glob)
      for (const name of await files.list(dir).catch(() => [])) {
        if (name.startsWith(prefix)) await files.remove(join(dir, name)).catch(() => undefined)
      }
    }
  }
}

export async function applyUpdate(
  deps: ApplyDeps,
  query: ReleaseQuery & { force?: boolean } = {}
): Promise<ApplyResult> {
  if (!deps.builtFor)
    throw new AtcError(
      'ATC_UPDATE_UNSUPPORTED',
      'This atc runs from source; it updates with git, not from a release.',
      {
        hint: 'use a released binary (the installer) to get updates with `atc update`',
      }
    )
  if (deps.installSource)
    throw new AtcError(
      'ATC_UPDATE_UNSUPPORTED',
      `This atc was installed by ${installLabel(deps.installSource)}; its package manager updates it.`,
      { hint: packageUpgradeHint(deps.installSource) }
    )
  const release = await fetchRelease(deps.fetch, query)
  const result = (updated: boolean): ApplyResult => ({
    updated,
    from: deps.currentVersion,
    to: release.version,
    path: deps.execPath,
    release: { tag: release.tag, url: release.url },
  })
  if (!query.tag && !query.force && !isNewer(release.version, deps.currentVersion)) return result(false)

  const name = assetNameFor(release.version, deps.platform, deps.arch, deps.builtFor)
  const asset = release.assets.find((a) => a.name === name)
  const sums = release.assets.find((a) => a.name === 'SHA256SUMS')
  if (!asset || !sums)
    throw new AtcError('ATC_UPDATE_FAILED', `Release ${release.tag} has no ${asset ? 'SHA256SUMS' : name}.`, {
      details: release.url,
    })
  const sumsRes = await deps.fetch(sums.url, { headers: { 'user-agent': 'atc' } })
  if (!sumsRes.ok)
    throw new AtcError('ATC_UPDATE_FAILED', `Could not download SHA256SUMS (${sumsRes.status}).`)
  const expected = parseSha256Sums(await sumsRes.text())[name]
  if (!expected)
    throw new AtcError('ATC_CHECKSUM_MISMATCH', `SHA256SUMS of ${release.tag} does not list ${name}.`)

  const download = join(
    dirname(deps.execPath),
    `.atc.download.${deps.now().getTime()}${deps.platform === 'win32' ? '.exe' : ''}`
  )
  try {
    const actual = await deps.files.download(asset.url, download)
    if (actual !== expected)
      throw new AtcError('ATC_CHECKSUM_MISMATCH', `The download of ${name} does not match SHA256SUMS.`, {
        details: `expected ${expected}, got ${actual}`,
      })
    if (deps.platform !== 'win32') await deps.files.chmod(download, 0o755)
    const why = trustDowngrade(
      await trustOf(deps.platform, deps.execPath, deps.exec),
      await trustOf(deps.platform, download, deps.exec)
    )
    if (why) throw new AtcError('ATC_UPDATE_FAILED', `Refusing ${name}: ${why}.`, { details: release.url })
    const version = await deps.exec(download, ['--version'], { timeoutMs: 30_000 })
    if (version.code !== 0 || version.stdout.trim() !== release.version)
      throw new AtcError(
        'ATC_UPDATE_FAILED',
        `The downloaded binary does not run as atc ${release.version}.`,
        {
          details:
            (version.error ?? version.stdout.trim()) || version.stderr.trim() || `exit code ${version.code}`,
        }
      )
    const stamp = deps
      .now()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14)
    await executeReplace(planReplace(deps.platform, deps.execPath, download, stamp), deps.files)
  } catch (error) {
    await deps.files.remove(download).catch(() => undefined)
    throw error
  }
  return result(true)
}
