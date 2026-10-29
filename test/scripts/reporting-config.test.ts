import { expect, it } from 'vitest'
import { assertReleaseReporting } from '../../scripts/reporting-config.mjs'
it('requires a valid DSN in releases, while source builds may report nowhere', () => {
  expect(() => assertReleaseReporting({})).not.toThrow()
  for (const environment of ['production', 'prerelease']) {
    expect(() => assertReleaseReporting({ ATC_SENTRY_ENVIRONMENT: environment })).toThrow('ATC_SENTRY_DSN')
    expect(() =>
      assertReleaseReporting({ ATC_SENTRY_ENVIRONMENT: environment, ATC_SENTRY_DSN: 'bad' })
    ).toThrow('ATC_SENTRY_DSN')
    expect(() =>
      assertReleaseReporting({
        ATC_SENTRY_ENVIRONMENT: environment,
        ATC_SENTRY_DSN: 'https://public@o1.ingest.sentry.io/42',
      })
    ).not.toThrow()
  }
})
