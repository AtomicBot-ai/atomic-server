/**
 * Audio generation on the wire: a copy of the slice of the core's `contracts/audio.ts`
 * (atomic-chat-core#61) atc reads, because the pinned core has none of it.
 *
 * core-workaround: audio-contract until core 0.21.0 — 0.20.5 exports no audio types and no audio-cpp
 * engine id; once the pin carries them, import these from `@atomic-chat/core/contracts` and delete this
 * file's copies.
 */

/** The engine-build id audio.cpp installs under (`/engine-builds/audio-cpp/*`). */
export const AUDIO_ENGINE_ID = 'audio-cpp'

/** What a model generates. */
export const AUDIO_MODES = ['speech', 'music', 'effects'] as const
export type AudioMode = (typeof AUDIO_MODES)[number]

/** audio.cpp's task for a model: `tts` for speech, `gen` for music and effects. */
export type AudioTask = 'tts' | 'gen'

export type AudioOptions = Record<string, string | number | boolean>

export type AudioModelState = 'unloaded' | 'loading' | 'loaded' | 'unloading' | 'failed'

export type AudioJobState = 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled'

/** audio.cpp reports no progress while it generates, so a job moves through phases only. */
export type AudioJobPhase = 'queued' | 'loading' | 'generating' | 'saving'

export interface LoadAudioModelRequest {
  /** `<catalog id>:<quant id>`, e.g. `moss-tts-nano-100m:q8_0`. */
  modelId: string
  displayName: string
  mode: AudioMode
  /** Relative to `<data>/audio/models`. */
  file: string
  family: string
  task: AudioTask
  loadOptions?: AudioOptions
  sessionOptions?: AudioOptions
  defaultRequestOptions?: AudioOptions
  /** The voice for a request that names none; some models refuse to speak without one. */
  defaultVoice?: string
}

export interface LoadedAudioModel {
  modelId: string
  displayName: string
  mode: AudioMode
  family: string
  task: AudioTask
}

export interface AudioStatus {
  model: { state: AudioModelState; loaded: LoadedAudioModel | null }
  /** A queued or generating job, so a reload can adopt it. */
  activeJob: AudioJob | null
  outputDir: string
  idleUnloadSecs: number
}

/** What the loaded model takes. */
export interface AudioCapabilities {
  modelId: string
  mode: AudioMode
  /** Built-in voices, empty when the model has none. */
  voices: string[]
  supportsVoiceRef: boolean
  requiresVoiceRef: boolean
}

export interface AudioGenerateRequest {
  /** Speech: the words to say. Music and effects: the description of the sound. */
  text: string
  voice?: string
  speed?: number
  language?: string
  instruct?: string
  lyrics?: string
  durationSec?: number
  bpm?: number
  seed?: number
  steps?: number
  negativePrompt?: string
  options?: AudioOptions
}

export interface AudioErrorBody {
  code: string
  message: string
  details?: string
}

export interface AudioGalleryItem {
  /** The job id; also the file stem. */
  id: string
  path: string
  sampleRate: number
  channels: number
  audioMs: number
  sizeBytes: number
  createdAtMs: number
  recipe: { mode: AudioMode; text: string; model: { modelId: string; displayName: string } }
}

export interface AudioJob {
  id: string
  state: AudioJobState
  mode: AudioMode
  modelId: string
  createdAtMs: number
  progress: { phase: AudioJobPhase; elapsedMs: number } | null
  output: AudioGalleryItem | null
  error?: AudioErrorBody
}

export interface AudioGalleryPage {
  items: AudioGalleryItem[]
  hasMore: boolean
  total: number
}

/**
 * What the catalog says about an audio model beyond its load, kept with a download plan so a client
 * draws the form and the notice of a model it has on disk. Data, never decided by model id.
 */
export interface AudioPlanDetails {
  mode: AudioMode
  /** Text to show with the model wherever it is offered or used, when its license asks for one. */
  attribution: string | null
  /** The form fields the model takes: `voice`, `speed`, `durationSec`… */
  controls: string[]
  defaults: Record<string, number>
  /** `[low, high]` of a numeric control. */
  ranges: Record<string, number[]>
}
