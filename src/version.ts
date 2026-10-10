/**
 * What `atc version` reports. `ATC_VERSION` is the one hand-maintained number (a test pins it to
 * package.json); the git sha and build date are baked in by `scripts/build-binaries.mjs` through
 * `--define` and are absent when running from source.
 */
declare const __ATC_GIT_SHA__: string | undefined
declare const __ATC_BUILD_DATE__: string | undefined
declare const __ATC_TARGET__: string | undefined

export const ATC_VERSION = '0.1.0'

export const ATC_GIT_SHA: string | undefined =
  typeof __ATC_GIT_SHA__ === 'string' && __ATC_GIT_SHA__ !== '' ? __ATC_GIT_SHA__ : undefined
export const ATC_BUILD_DATE: string | undefined =
  typeof __ATC_BUILD_DATE__ === 'string' && __ATC_BUILD_DATE__ !== '' ? __ATC_BUILD_DATE__ : undefined

/** The release triple this binary was built for (`scripts/targets.mjs`); absent when run from source. */
export const ATC_TARGET: string | undefined =
  typeof __ATC_TARGET__ === 'string' && __ATC_TARGET__ !== '' ? __ATC_TARGET__ : undefined

export { CORE_VERSION } from '@atomic-chat/core'
