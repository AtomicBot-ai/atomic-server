/**
 * Where atc's own error reports go: its own Sentry project, apart from the core's. The DSN is baked
 * into release binaries only (`scripts/build-binaries.mjs`), so a build from source reports nowhere
 * unless `ATC_SENTRY_DSN` names a project for a local check.
 */

import { isTestRun, parseDsn } from '@atomic-chat/core/host'
import type { TelemetryConfig } from '@atomic-chat/core/host'

declare const __ATC_SENTRY_DSN__: string | undefined
declare const __ATC_SENTRY_ENVIRONMENT__: string | undefined

export interface BakedReporting {
  dsn?: string
  environment?: string
}

/** What the release build baked into this binary. Empty from source and in tests. */
export const BAKED_REPORTING: BakedReporting = {
  ...(typeof __ATC_SENTRY_DSN__ === 'string' && __ATC_SENTRY_DSN__ !== '' ? { dsn: __ATC_SENTRY_DSN__ } : {}),
  ...(typeof __ATC_SENTRY_ENVIRONMENT__ === 'string' && __ATC_SENTRY_ENVIRONMENT__ !== ''
    ? { environment: __ATC_SENTRY_ENVIRONMENT__ }
    : {}),
}

/**
 * The project, environment and release of atc's reports, or null when they go nowhere. An explicit
 * `ATC_SENTRY_DSN` wins; the baked one is never used under a test runner (the release job runs the
 * e2e on the very binary it ships). `development` turns reporting off, as it does for the core.
 */
export function atcReportingConfig(input: {
  baked: BakedReporting
  env: NodeJS.ProcessEnv
  version: string
  gitSha?: string | undefined
  /** Set when the process itself runs under a test runner, whatever `env` was injected. */
  testRun: boolean
}): TelemetryConfig | null {
  const { baked, env } = input
  const testRun = input.testRun || isTestRun(env)
  // An empty variable (a template's `ATC_SENTRY_DSN=`) is no choice, as it is for the core's DSN.
  const explicit = env['ATC_SENTRY_DSN']?.trim()
  const dsn = parseDsn(explicit || (testRun ? undefined : baked.dsn))
  if (!dsn) return null
  const environment = env['ATC_SENTRY_ENVIRONMENT']?.trim() || baked.environment || 'source'
  if (environment === 'development') return null
  const dist = input.gitSha?.trim().slice(0, 12)
  return { dsn, environment, release: `atc@${input.version}`, ...(dist ? { dist } : {}) }
}
