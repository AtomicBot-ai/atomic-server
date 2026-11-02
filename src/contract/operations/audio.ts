import type { WorkspaceOperation } from '../workspace.js'
import { operation } from './define.js'
import { AUDIO_CONFIG_REQUEST, AUDIO_LOAD_REQUEST, AUDIO_MODE, AUDIO_REQUEST } from './audio-requests.js'

/** Speech, music and sound effects on audio.cpp. */
export const AUDIO_OPERATIONS: readonly WorkspaceOperation[] = [
  operation(
    'audio.status',
    'Status',
    'read',
    'Read the state of the audio engine, the audio model it has loaded and the job it is running.'
  ),
  operation(
    'audio.capabilities',
    'Capabilities',
    'read',
    'Read what the loaded audio model takes: its request options, built-in voices and voice cloning.'
  ),
  operation('audio.files', 'Files', 'read', 'List the audio model files available to load.'),
  operation('audio.gallery', 'Gallery', 'read', 'List generated audio clips (the latest 100).'),
  operation(
    'audio.configure',
    'Configure',
    'configure',
    'Configure audio generation: the gallery folder and idle unload.',
    { properties: { request: AUDIO_CONFIG_REQUEST }, required: ['request'] }
  ),
  operation(
    'audio.load',
    'Load',
    'load',
    'Load an audio model file by hand; artifacts.load does this for a catalog model. One audio model runs at a time. Engine capability limits apply.',
    { properties: { request: AUDIO_LOAD_REQUEST }, required: ['request'] }
  ),
  operation('audio.unload', 'Unload', 'interrupt', 'Unload the audio model and free its memory.'),
  operation(
    'audio.generate',
    'Generate audio',
    'generate',
    "Start an audio job from text in the loaded model's mode; read audio.job for its phase and result. Engine capability limits apply.",
    { properties: { mode: AUDIO_MODE, request: AUDIO_REQUEST }, required: ['mode', 'request'] }
  ),
  operation('audio.job', 'Audio progress', 'read', 'Read the phase and result of an audio job.', {
    properties: { id: { type: 'string' } },
    required: ['id'],
  }),
  operation(
    'audio.cancel',
    'Cancel audio',
    'interrupt',
    'Cancel an audio job. A running job stops the audio server; the next job starts it again.',
    { properties: { id: { type: 'string' } }, required: ['id'] }
  ),
  operation('audio.delete', 'Delete clip', 'configure', 'Delete a generated audio clip from the gallery.', {
    properties: { id: { type: 'string' } },
    required: ['id'],
  }),
]
