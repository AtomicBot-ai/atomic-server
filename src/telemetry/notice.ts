/**
 * Error reports and the person's say over them. `atc` keeps them on by default, says so once, and
 * gives the core its own precedence (`DO_NOT_TRACK`, `ATOMIC_CORE_TELEMETRY`, the stored consent)
 * unless the person chose in `atc`'s config — passing the default would override all of that.
 */

import { CORE_VERSION } from '@atomic-chat/core'
import { takeFirstRunNotice } from '@atomic-chat/core/host'
import type { AtcPaths, ResolvedConfig } from '../config/index.js'

export const TELEMETRY_NOTICE =
  'Atomic Server sends anonymous crash and error reports (no prompts, replies, file paths or personal ' +
  'data) to help fix failures. Turn them off with `atc config set telemetry.enabled false` or DO_NOT_TRACK=1.'

/** What the core is told: a flag or an explicit config value; `undefined` lets the core decide. */
export function telemetryConsent(
  flag: boolean | undefined,
  config: Pick<ResolvedConfig, 'values' | 'sources'>
): boolean | undefined {
  if (flag !== undefined) return flag
  if (config.sources['telemetry.enabled'] === 'default') return undefined
  return config.values.telemetry.enabled
}

/**
 * True once per data folder when reports would go out only because nobody said no: not when the
 * config, the environment or the core's stored consent decided, and not in a build that reports
 * nowhere. Showing it is recorded in the core's telemetry file.
 */
export async function takeTelemetryNotice(input: {
  config: Pick<ResolvedConfig, 'values' | 'sources'>
  paths: Pick<AtcPaths, 'layout'>
  env: NodeJS.ProcessEnv
}): Promise<boolean> {
  if (telemetryConsent(undefined, input.config) !== undefined) return false
  return takeFirstRunNotice({
    telemetryFile: input.paths.layout.core.telemetry,
    env: input.env,
    version: CORE_VERSION,
    // The injected environment decides, not this process's (the core would read `process.env`).
    testRun: input.env['VITEST'] !== undefined || input.env['NODE_ENV'] === 'test',
  })
}
