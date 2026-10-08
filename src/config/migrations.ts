/**
 * Config file versions. A file newer than this build is refused rather than half-read; an older
 * one is migrated forward step by step, each step a pure function of the raw document.
 */

import { AtcError } from '../errors/index.js'
import { CONFIG_VERSION } from './schema.js'

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Key N migrates a version-N document to N+1. */
export const MIGRATIONS: Record<number, Migration> = {
  2: (raw) => ({ ...raw }),
  /**
   * 1 → 2: `atc serve` is gone (ADR "Name the product Atomic Server and align the commands with
   * the app"). Its engine and the duplicate `engines.provider` become `engines.default`; its model,
   * context size and GPU layers are dropped — the model is named on `atc run`, and the other two are
   * engine settings the core owns.
   */
  1: (raw) => {
    const { serve, ...rest } = raw
    const engines = isObject(rest['engines']) ? { ...rest['engines'] } : {}
    const chosen = engines['provider'] ?? (isObject(serve) ? serve['engine'] : undefined)
    delete engines['provider']
    if (chosen !== undefined) engines['default'] = chosen
    return Object.keys(engines).length > 0 ? { ...rest, engines } : rest
  },
}

export function migrateConfig(raw: Record<string, unknown>): {
  raw: Record<string, unknown>
  migratedFrom?: number
} {
  const version = typeof raw['version'] === 'number' ? raw['version'] : 1
  if (version > CONFIG_VERSION) {
    throw new AtcError(
      'ATC_CONFIG_INVALID',
      `The config file is version ${version}; this atc understands ${CONFIG_VERSION}.`,
      {
        hint: 'update atc (`atc update`) or move the file aside',
      }
    )
  }
  if (version === CONFIG_VERSION) return { raw: { ...raw, version } }
  let current = { ...raw, version }
  for (let v = version; v < CONFIG_VERSION; v += 1) {
    const step = MIGRATIONS[v]
    if (!step) throw new AtcError('ATC_CONFIG_MIGRATION_FAILED', `No migration from config version ${v}.`)
    current = { ...step(current), version: v + 1 }
  }
  return { raw: current, migratedFrom: version }
}
