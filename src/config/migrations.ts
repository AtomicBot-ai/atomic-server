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
  /**
   * 6 → 7: `api.cors`, `admin.openOnStart`, `engines.autoInstall`, `managed.mode`, `managed.image`
   * and `update.channel` are gone. Nothing read them: the core installs the engine build it
   * recommends itself, the admin follows `admin.autoStart`, and stable is the only release channel.
   */
  6: (raw) => {
    const { api, admin, engines, update, managed, ...rest } = raw
    const stripped = (section: unknown, ...keys: string[]): Record<string, unknown> | undefined => {
      if (!isObject(section)) return undefined
      const next = { ...section }
      for (const key of keys) delete next[key]
      return Object.keys(next).length > 0 ? next : undefined
    }
    const nextApi = stripped(api, 'cors')
    const nextAdmin = stripped(admin, 'openOnStart')
    const nextEngines = stripped(engines, 'autoInstall')
    const nextUpdate = stripped(update, 'channel')
    const nextManaged = stripped(managed, 'mode', 'image')
    return {
      ...rest,
      ...(nextApi ? { api: nextApi } : {}),
      ...(nextAdmin ? { admin: nextAdmin } : {}),
      ...(nextEngines ? { engines: nextEngines } : {}),
      ...(nextUpdate ? { update: nextUpdate } : {}),
      ...(nextManaged ? { managed: nextManaged } : {}),
    }
  },
  // An omitted port meant 1337. The old default chat URL meant "follow this server",
  // including when a config edit had written that URL alongside a custom API port.
  5: (raw) => {
    const api = isObject(raw['api']) ? raw['api'] : {}
    const tui = raw['tui']
    return {
      ...raw,
      api: { ...api, port: api['port'] ?? 1337 },
      ...(isObject(tui) && tui['endpoint'] === 'http://127.0.0.1:1337/v1'
        ? { tui: { ...tui, endpoint: '' } }
        : {}),
    }
  },
  /**
   * 4 → 5: `tui.mode` is gone. The terminal UI always opens on Server and Playground is a page of it
   * (ADR "Adapt the desktop structure to a server-first workspace"); nothing read the value any more.
   */
  4: (raw) => {
    if (!isObject(raw['tui']) || !('mode' in raw['tui'])) return { ...raw }
    const { mode: _dropped, ...tui } = raw['tui']
    const { tui: _old, ...rest } = raw
    return Object.keys(tui).length > 0 ? { ...rest, tui } : rest
  },
  /**
   * 3 → 4: `api.requireKey` is gone. The server creates its keyring when it starts and the core checks
   * it on every request on any address, so there is no keyless API left to refuse
   * (ADR "Require a key from the keyring for every API client").
   */
  3: (raw) => {
    if (!isObject(raw['api']) || !('requireKey' in raw['api'])) return { ...raw }
    const { requireKey: _dropped, ...api } = raw['api']
    return { ...raw, api }
  },
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
        hint: 'update atc (`atc update`, or the package manager that installed it) or move the file aside',
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
