/**
 * LiteRT-LM's accelerator in the server (spec `litert-lm-server`, design D3): `openvino`, which an
 * Intel NPU variant needs on Windows. The core offers it only there; elsewhere the listing is empty.
 * A prepare downloads it through atc's proxy, as an engine install does.
 */

import type {
  LiteRtLmAccelerators,
  LiteRtLmAcceleratorsEvent,
  LiteRtLmPrepareResult,
} from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'
import type { ProxyConfig } from '../downloads/index.js'
import { EngineAccelerators } from './accelerators.js'

export class LiteRtAccelerators extends EngineAccelerators<
  LiteRtLmAccelerators,
  LiteRtLmAcceleratorsEvent,
  LiteRtLmPrepareResult
> {
  constructor(link: CoreLink, options: { retryMs?: number; proxy?: () => ProxyConfig | null } = {}) {
    super(
      link,
      {
        route: '/runtimes/litert-lm/accelerators',
        event: 'litert-lm:accelerators',
        label: 'LiteRT-LM',
        // The core reads the active build and its manifest on every listing; it has nothing to refresh.
        force: false,
        ...(options.proxy ? { proxy: options.proxy } : {}),
      },
      options
    )
  }
}
