/**
 * What `atc` knows about LiteRT-LM (change `add-litert-lm-runtime`): the core's accelerator listing with
 * this server's prepare, and the models to download with the core's verdicts — for a command, the
 * terminal UI and the admin alike. Browser-safe: types only.
 */

import type {
  LiteRtLmAccelerators,
  LiteRtLmAcceleratorsEvent,
  LiteRtLmBackendId,
  LiteRtLmCheckResult,
  LiteRtLmNpu,
  LiteRtLmPrepareResult,
} from '@atomic-chat/core/contracts'

/** `litert.accelerators`: what the core offers this machine, and whether this server is preparing now. */
export type LiteRtAcceleratorsView = LiteRtLmAccelerators & {
  preparing: boolean
  /** The last prepare's summary, `null` before one ended. */
  last_result: LiteRtLmPrepareResult | null
  last_error: string | null
  /** The latest step of each accelerator in the prepare running now (or the last one). */
  steps: LiteRtLmAcceleratorsEvent[]
}

/** One variant of a LiteRT-LM model for this platform, with the core's verdict on it. */
export interface LiteRtVariantRow {
  id: string
  backend: LiteRtLmBackendId
  npu?: LiteRtLmNpu
  /** Path inside the repository, size and sha256 (conf's, or the Hub's LFS metadata). */
  file: { path: string; size: number; sha256: string }
  min_runtime_version?: string
  verdict: LiteRtLmCheckResult
}

/** A LiteRT-LM model: conf's (checked by Atomic Chat) or a Hugging Face repository (not checked). */
export interface LiteRtModelRow {
  origin: 'curated' | 'huggingface'
  /** conf's id, or the repository for a Hugging Face model. */
  model_id: string
  name: string
  summary: string
  license: string | null
  /** The repository's terms must be accepted: the download needs the server's `HF_TOKEN`. */
  gated: boolean
  /** A Hugging Face model: not checked by Atomic Chat. */
  unverified: boolean
  repo: string
  /** The commit every file is downloaded from. */
  revision: string
  /** conf's; a Hugging Face model's come from the core's check of the downloaded file. */
  context_length?: number
  tools?: boolean
  reasoning?: boolean
  vision?: boolean
  variants: LiteRtVariantRow[]
  /** NPU, then GPU, then CPU among variants that run (`ok`) or will once prepared. */
  default_variant: string | null
}

/** `models.catalog` (conf's list only) and `models.search` (then Hugging Face) with `engine: litert-lm`. */
export interface LiteRtSearchResult {
  /** This machine as conf names platforms. */
  platform: string
  list_source: 'remote' | 'cache' | 'baseline'
  list_error: string | null
  /** Whether Hugging Face was asked (search) or not (catalog). */
  huggingface: boolean
  huggingface_unavailable: boolean
  huggingface_error: string | null
  models: LiteRtModelRow[]
}
