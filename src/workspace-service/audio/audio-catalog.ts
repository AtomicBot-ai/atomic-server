/**
 * The audio model catalog: conf's `models/audio.json`, fetched at most once an hour; when conf cannot
 * serve it (its PR is not merged yet) or serves a newer `schema_version`, the last accepted copy, else the
 * copy bundled here. The file is conf's, verbatim: refresh it from conf, never edit it here.
 */
import { AUDIO_ENGINE_ID, AUDIO_MODES } from '../../contract/index.js'
import { fetchConfList } from '../models/conf-list.js'
import type { ConfListOptions, ConfListResult } from '../models/conf-list.js'
import { object } from '../validation.js'
import baseline from './audio-catalog-baseline.json' with { type: 'json' }

export const DEFAULT_AUDIO_MODELS_URL =
  'https://raw.githubusercontent.com/AtomicBot-ai/atomic-chat-conf/main/models/audio.json'
export const SUPPORTED_AUDIO_SCHEMA_VERSION = 1

export interface AudioCatalog {
  models: Array<Record<string, unknown>>
}

/** What this client can run: a model of a known mode on audio.cpp, with a file to download. */
function runnable(model: Record<string, unknown>): boolean {
  return (
    model['active'] !== false &&
    typeof model['id'] === 'string' &&
    (AUDIO_MODES as readonly unknown[]).includes(model['mode']) &&
    Array.isArray(model['engines']) &&
    model['engines'].includes(AUDIO_ENGINE_ID) &&
    Array.isArray(model['quants']) &&
    model['quants'].length > 0
  )
}

/** Refuses a newer schema whole; skips an entry this client cannot run. */
export function parseAudioCatalog(raw: unknown): AudioCatalog {
  const document = object(raw)
  if (document['schema_version'] !== SUPPORTED_AUDIO_SCHEMA_VERSION)
    throw new Error(`Audio model list: unsupported schema ${String(document['schema_version'])}.`)
  if (!Array.isArray(document['models'])) throw new Error('Audio model list: no models.')
  return { models: document['models'].map(object).filter(runnable) }
}

export function fetchAudioCatalog(options: ConfListOptions): Promise<ConfListResult<AudioCatalog>> {
  return fetchConfList(
    {
      label: 'Audio model list',
      defaultUrl: DEFAULT_AUDIO_MODELS_URL,
      parse: parseAudioCatalog,
      baseline,
    },
    // Audio is not a unified collection yet; keep its independent list and cache.
    { ...options, url: options.url ?? DEFAULT_AUDIO_MODELS_URL }
  )
}
