/**
 * What `atc` knows about LiteRT-LM (change `add-litert-lm-runtime`): the core's accelerator listing with
 * this server's prepare, for a command, the terminal UI and the admin alike. Browser-safe: types only.
 */

import type {
  LiteRtLmAccelerators,
  LiteRtLmAcceleratorsEvent,
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
