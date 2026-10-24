/**
 * The one table every config feature reads from: types, defaults, env names and descriptions.
 * Parsing, `config set` validation, `config list` and the admin's `/api/config` all derive from
 * it, so a field is added in exactly one place.
 */

import { LOCAL_PROVIDER_IDS } from '@atomic-chat/core/settings'
import type { LocalProviderId } from '@atomic-chat/core/contracts'

export type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'enum'

export interface FieldSpec {
  /** Dotted path in the config object, e.g. `api.port`. */
  path: string
  type: FieldType
  default: unknown
  description: string
  /** For `enum`. */
  values?: readonly string[]
  /** Environment variable; derived from the path when absent (`api.port` → `ATC_API_PORT`). */
  env?: string
  min?: number
  max?: number
}

export const CONFIG_VERSION = 4

export interface AtcConfig {
  version: number
  tui: {
    mode: 'ask' | 'personal' | 'server'
    endpoint: string
    model: string
    motion: boolean
    mouse: boolean
  }
  api: {
    host: string
    port: number
    prefix: string
    cors: boolean
    trustedHosts: string[]
    autoStart: boolean
  }
  admin: { host: string; port: number; openOnStart: boolean; autoStart: boolean }
  engines: { autoInstall: boolean; default: LocalProviderId }
  models: { autoLoad: string[] }
  managed: { mode: 'off' | 'docker-tensorrt'; image?: string }
  proxy: { url?: string; noProxy: string[]; ignoreSsl: boolean }
  update: { channel: 'stable'; checkOnStart: boolean }
  telemetry: { enabled: boolean }
  log: { level: 'debug' | 'info' | 'warn' | 'error'; maxFiles: number; maxSizeMb: number }
}

/** Every local provider of the core `atc` embeds: what a load may name (spec `server-engine-settings`). */
const PROVIDERS: readonly string[] = LOCAL_PROVIDER_IDS

export const FIELDS: readonly FieldSpec[] = [
  {
    path: 'tui.mode',
    type: 'enum',
    default: 'ask',
    values: ['ask', 'personal', 'server'],
    description: 'Legacy workspace preference; the terminal now always opens on Server',
  },
  {
    path: 'tui.endpoint',
    type: 'string',
    default: 'http://127.0.0.1:1337/v1',
    description: 'OpenAI-compatible endpoint for terminal chat',
  },
  { path: 'tui.model', type: 'string', default: '', description: 'Last selected chat model' },
  { path: 'tui.motion', type: 'boolean', default: true, description: 'Animate the eye on an empty chat' },
  {
    path: 'tui.mouse',
    type: 'boolean',
    default: true,
    description: 'Mouse navigation; Ctrl+X releases capture for text selection',
  },
  {
    path: 'api.host',
    type: 'string',
    default: '127.0.0.1',
    description: 'Bind address of the OpenAI-compatible API',
  },
  {
    path: 'api.port',
    type: 'number',
    default: 1337,
    min: 0,
    max: 65535,
    description: 'Port of the OpenAI-compatible API',
  },
  { path: 'api.prefix', type: 'string', default: '/v1', description: 'Path prefix of the API' },
  { path: 'api.cors', type: 'boolean', default: true, description: 'Send CORS headers on the API' },
  {
    path: 'api.trustedHosts',
    type: 'string[]',
    default: [],
    description: 'Extra Host values the API accepts',
  },
  {
    path: 'api.autoStart',
    type: 'boolean',
    default: true,
    description: 'Start the API when the server starts',
  },
  { path: 'admin.host', type: 'string', default: '127.0.0.1', description: 'Bind address of the web admin' },
  {
    path: 'admin.port',
    type: 'number',
    default: 1338,
    min: 0,
    max: 65535,
    description: 'Port of the web admin (0 = random)',
  },
  {
    path: 'admin.openOnStart',
    type: 'boolean',
    default: false,
    description: 'Open the admin in a browser after `atc start`',
  },
  {
    path: 'admin.autoStart',
    type: 'boolean',
    default: true,
    description: 'Serve the admin when the server starts',
  },
  {
    path: 'engines.autoInstall',
    type: 'boolean',
    default: true,
    description: 'Install the engine build the core recommends when the server starts with none',
  },
  {
    path: 'engines.default',
    type: 'enum',
    values: PROVIDERS,
    default: 'llamacpp-upstream',
    description: 'Engine `atc run` uses when none is running and none is named (`--engine` sets it)',
  },
  {
    path: 'models.autoLoad',
    type: 'string[]',
    default: [],
    description: 'Models to run when the server starts',
  },
  {
    path: 'managed.mode',
    type: 'enum',
    values: ['off', 'docker-tensorrt'],
    default: 'off',
    description: 'Managed container runtime',
  },
  {
    path: 'managed.image',
    type: 'string',
    default: undefined,
    description: 'Override the pinned managed runtime image',
  },
  { path: 'proxy.url', type: 'string', default: undefined, description: 'HTTPS proxy for downloads' },
  { path: 'proxy.noProxy', type: 'string[]', default: [], description: 'Hosts that bypass the proxy' },
  {
    path: 'proxy.ignoreSsl',
    type: 'boolean',
    default: false,
    description: 'Skip TLS verification through the proxy',
  },
  {
    path: 'update.channel',
    type: 'enum',
    values: ['stable'],
    default: 'stable',
    description: 'Release channel for `atc update`',
  },
  {
    path: 'update.checkOnStart',
    type: 'boolean',
    default: true,
    description: 'Check for a new atc on start',
  },
  {
    path: 'telemetry.enabled',
    type: 'boolean',
    default: true,
    description: "Report the core's crashes and errors",
  },
  {
    path: 'log.level',
    type: 'enum',
    values: ['debug', 'info', 'warn', 'error'],
    default: 'info',
    description: 'Server log level',
  },
  {
    path: 'log.maxFiles',
    type: 'number',
    default: 5,
    min: 1,
    max: 50,
    description: 'Rotated server log files to keep',
  },
  {
    path: 'log.maxSizeMb',
    type: 'number',
    default: 10,
    min: 1,
    max: 1024,
    description: 'Size of one server log file',
  },
]

export function envNameFor(field: FieldSpec): string {
  if (field.env) return field.env
  return `ATC_${field.path
    .replace(/\./g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()}`
}

export function fieldFor(path: string): FieldSpec | undefined {
  return FIELDS.find((f) => f.path === path)
}

export function getAt(object: unknown, path: string): unknown {
  let current: unknown = object
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function setAt(object: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let current = object
  for (const key of keys.slice(0, -1)) {
    const next = current[key]
    if (next === null || typeof next !== 'object') {
      const created: Record<string, unknown> = {}
      current[key] = created
      current = created
    } else current = next as Record<string, unknown>
  }
  const last = keys[keys.length - 1] as string
  if (value === undefined) delete current[last]
  else current[last] = value
}

export function defaultConfig(): AtcConfig {
  const raw: Record<string, unknown> = { version: CONFIG_VERSION }
  for (const field of FIELDS)
    if (field.default !== undefined) setAt(raw, field.path, structuredClone(field.default))
  return raw as unknown as AtcConfig
}
