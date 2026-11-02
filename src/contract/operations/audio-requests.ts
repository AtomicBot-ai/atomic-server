import { AUDIO_MODES } from '../audio.js'
import { request } from './define.js'

// The Core request bodies of the audio operations, kept apart so `audio.ts` reads as a list.

/** A clip to generate; which fields apply depends on the loaded model. */
export const AUDIO_REQUEST = request(
  {
    text: {
      type: 'string',
      description: 'Speech: the words to say. Music and effects: a description of the sound.',
    },
    voice: { type: 'string', description: 'Speech: one of the voices audio.capabilities lists.' },
    voiceRef: { type: 'object', description: 'Speech: a WAV to clone, { path } or { base64 }.' },
    referenceText: { type: 'string', description: 'Speech: the transcript of voiceRef.' },
    speed: { type: 'number', minimum: 0 },
    language: { type: 'string' },
    instruct: { type: 'string', description: 'Speech: a style instruction.' },
    lyrics: { type: 'string', description: 'Music: the words to sing.' },
    durationSec: {
      type: 'number',
      minimum: 0,
      description: "Music and effects: length in seconds; absent, the model's catalog default.",
    },
    bpm: { type: 'integer', minimum: 1 },
    seed: { type: 'integer' },
    steps: { type: 'integer', minimum: 1 },
    negativePrompt: { type: 'string' },
    options: { type: 'object', description: 'Any other request option the model declares.' },
  },
  ['text']
)

/** The mode of a job: it must be the loaded model's. */
export const AUDIO_MODE = { type: 'string', enum: AUDIO_MODES } as const

/** The gallery folder and idle unload. */
export const AUDIO_CONFIG_REQUEST = request({
  outputDir: { description: 'Gallery folder; null goes back to the default.' },
  idleUnloadSecs: { type: 'integer', minimum: 0 },
})

/** An audio model file to serve and what audio.cpp serves it as. */
export const AUDIO_LOAD_REQUEST = request(
  {
    modelId: { type: 'string' },
    displayName: { type: 'string' },
    mode: AUDIO_MODE,
    file: { type: 'string', description: 'A file under the audio models folder (audio.files).' },
    family: { type: 'string' },
    task: { type: 'string', enum: ['tts', 'gen'] },
    loadOptions: { type: 'object' },
    sessionOptions: { type: 'object' },
    defaultRequestOptions: { type: 'object' },
    defaultVoice: { type: 'string' },
    threads: { type: 'integer', minimum: 1 },
    startupTimeoutSecs: { type: 'integer', minimum: 1 },
  },
  ['modelId', 'displayName', 'mode', 'file', 'family', 'task']
)
