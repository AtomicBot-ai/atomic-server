import { defaultConfig } from '../config/index.js'
import type { ResolvedConfig } from '../config/index.js'

/**
 * Whether terminal chat talks to this server, wherever it listens, rather than to an address someone
 * chose. Any config edit writes the whole file, defaults included, so the default endpoint read back
 * from the file is still no choice; an `ATC_TUI_ENDPOINT` set to it is one.
 */
export function followsLocalServer(config: Pick<ResolvedConfig, 'values' | 'sources'>): boolean {
  return (
    config.sources?.['tui.endpoint'] !== 'env' && config.values.tui.endpoint === defaultConfig().tui.endpoint
  )
}
