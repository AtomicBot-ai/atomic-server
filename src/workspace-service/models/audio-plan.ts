import { looksLikeHfRepo } from '@atomic-chat/core/models'
import { AUDIO_ENGINE_ID, AUDIO_MODES } from '../../contract/index.js'
import type {
  AudioMode,
  AudioOptions,
  AudioPlanDetails,
  LoadAudioModelRequest,
} from '../../contract/index.js'
import type { DownloadItem } from '../../downloads/index.js'
import { object } from '../validation.js'
import type { CatalogRow } from './catalog.js'

/** `<data>/audio/models`: the one folder the core lists, loads from and deletes in. */
const MODELS_ROOT = 'audio/models'

function fail(problem: string): never {
  throw new Error(`Invalid audio catalog entry: ${problem}.`)
}

const options = (value: unknown): AudioOptions | undefined => {
  const entries = Object.entries(object(value))
  return entries.length ? (Object.fromEntries(entries) as AudioOptions) : undefined
}

/** One file, at the pinned revision, with the size and digest the download is checked against. */
function audioFile(row: CatalogRow, quant: Record<string, unknown>): DownloadItem {
  const { repo, revision } = row.source,
    { path, filename, bytes, sha256 } = quant
  if (typeof repo !== 'string' || !looksLikeHfRepo(repo)) fail('repository')
  if (typeof revision !== 'string' || !/^[0-9a-f]{40}$/.test(revision)) fail('a full commit SHA is required')
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').some((p) => !p || p === '..'))
    fail('path')
  if (typeof filename !== 'string' || !/^[\w.-]+$/.test(filename) || /^\.+$/.test(filename)) fail('filename')
  if (typeof bytes !== 'number' || !(bytes > 0)) fail('size')
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) fail('sha256')
  return {
    url: `https://huggingface.co/${repo}/resolve/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`,
    save_path: `${MODELS_ROOT}/${filename}`,
    size: bytes,
    sha256,
  }
}

/** What `artifactPlan` needs for an audio model: its one file, its load and what clients draw from it. */
export function audioPlan(row: CatalogRow, quantId?: string) {
  const r = row.source,
    quants = Array.isArray(r['quants']) ? r['quants'].map(object) : []
  const choice = quantId
    ? quants.find((q) => q['id'] === quantId)
    : (quants.find((q) => q['recommended'] === true) ?? quants[0])
  if (!choice) throw new Error('Choose an available quantization.')
  const mode = r['mode'] as AudioMode
  if (!AUDIO_MODES.includes(mode)) fail('mode')
  if (r['task'] !== 'tts' && r['task'] !== 'gen') fail('task')
  if (typeof r['family'] !== 'string' || !r['family']) fail('family')
  const file = audioFile(row, choice),
    model_id = `${row.id}:${String(choice['id'])}`,
    loadOptions = options(r['load_options']),
    sessionOptions = options(r['session_options']),
    defaultRequestOptions = options(r['default_request_options'])
  const load: LoadAudioModelRequest = {
    modelId: model_id,
    displayName: row.name,
    mode,
    file: String(choice['filename']),
    family: r['family'],
    task: r['task'],
    ...(loadOptions ? { loadOptions } : {}),
    ...(sessionOptions ? { sessionOptions } : {}),
    ...(defaultRequestOptions ? { defaultRequestOptions } : {}),
    ...(typeof r['default_voice'] === 'string' ? { defaultVoice: r['default_voice'] } : {}),
  }
  const audio: AudioPlanDetails = {
    mode,
    attribution: typeof r['attribution'] === 'string' ? r['attribution'] : null,
    controls: Array.isArray(r['controls']) ? r['controls'].map(String) : [],
    defaults: object(r['defaults']) as AudioPlanDetails['defaults'],
    ranges: object(r['ranges']) as AudioPlanDetails['ranges'],
  }
  return { model_id, engine: AUDIO_ENGINE_ID, files: [file], load, audio }
}
