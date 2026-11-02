/** Audio wire types come from the embedded core; only the download plan belongs to atc. */
import type { AudioMode } from '@atomic-chat/core/contracts'
export { AUDIO_ENGINE_ID, AUDIO_MODES } from '@atomic-chat/core/contracts'
export type {
  AudioMode,
  AudioTask,
  AudioOptions,
  AudioModelState,
  AudioJobState,
  AudioJobPhase,
  LoadAudioModelRequest,
  LoadedAudioModel,
  AudioStatus,
  AudioCapabilities,
  AudioGenerateRequest,
  AudioErrorBody,
  AudioGalleryItem,
  AudioJob,
  AudioGalleryPage,
} from '@atomic-chat/core/contracts'

export interface AudioPlanDetails {
  mode: AudioMode
  attribution: string | null
  controls: string[]
  defaults: Record<string, number>
  ranges: Record<string, number[]>
}
