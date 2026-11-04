/**
 * The audio model catalog: the `audio` collection of conf's unified `models/catalog.json`, read like every
 * other category through `unified-catalog.ts` (one cache, one bundled snapshot, `ATC_MODEL_CATALOG_URL`).
 * conf's `models/audio.json` is only a generated export of that collection for released clients; never
 * read it here.
 */
import { AUDIO_ENGINE_ID, AUDIO_MODES } from '../../contract/index.js'
import { object } from '../validation.js'

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
