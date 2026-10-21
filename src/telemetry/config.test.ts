import { describe, expect, it } from 'vitest'
import { atcReportingConfig } from './config.js'

const DSN = 'https://abc@o1.ingest.sentry.io/42'
const OTHER = 'https://def@o1.ingest.sentry.io/7'

describe('atcReportingConfig', () => {
  it.each([
    ['a build without a DSN reports nowhere', {}, {}, false, null],
    [
      'a release build reports to its baked project',
      { dsn: DSN, environment: 'production' },
      {},
      false,
      '42 production',
    ],
    ['a baked DSN without an environment is a source build', { dsn: DSN }, {}, false, '42 source'],
    ['the environment overrides the baked DSN', { dsn: DSN }, { ATC_SENTRY_DSN: OTHER }, false, '7 source'],
    [
      'the environment overrides the baked environment',
      { dsn: DSN, environment: 'production' },
      { ATC_SENTRY_ENVIRONMENT: 'staging' },
      false,
      '42 staging',
    ],
    ['development reports nowhere', { dsn: DSN }, { ATC_SENTRY_ENVIRONMENT: 'development' }, false, null],
    ['a test run never uses the baked DSN', { dsn: DSN, environment: 'production' }, {}, true, null],
    ['a test run under an injected VITEST neither', { dsn: DSN }, { VITEST: 'true' }, false, null],
    ['an explicit DSN reports even from a test run', {}, { ATC_SENTRY_DSN: OTHER }, true, '7 source'],
    ['a malformed DSN reports nowhere', { dsn: 'not a dsn' }, {}, false, null],
    ['an empty variable keeps the baked DSN', { dsn: DSN }, { ATC_SENTRY_DSN: ' ' }, false, '42 source'],
  ] as const)('%s', (_name, baked, env, testRun, expected) => {
    const config = atcReportingConfig({ baked, env, version: '0.1.0', testRun })
    expect(config && `${config.dsn.projectId} ${config.environment}`).toBe(expected)
  })

  it('names the release after atc and the commit as its dist', () => {
    const config = atcReportingConfig({
      baked: { dsn: DSN, environment: 'production' },
      env: {},
      version: '0.1.0',
      gitSha: '0123456789abcdef',
      testRun: false,
    })
    expect(config).toMatchObject({ release: 'atc@0.1.0', dist: '0123456789ab' })
  })
})
