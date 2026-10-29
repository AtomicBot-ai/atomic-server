import { parseDsn } from '@atomic-chat/core/host'

/** Official release builds must not silently ship with their own error collection disabled. */
export function assertReleaseReporting(env) {
  const release = ['production', 'prerelease'].includes(env.ATC_SENTRY_ENVIRONMENT)
  const dsn = env.ATC_SENTRY_DSN?.trim()
  if ((release || dsn) && !parseDsn(dsn))
    throw new Error('A valid ATC_SENTRY_DSN is required for release error reporting.')
}
