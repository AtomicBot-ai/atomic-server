import type { ResolvedConfig } from '../config/index.js'

/** A saved URL is an explicit target. An empty setting follows the local API. */
export function followsLocalServer(config: Pick<ResolvedConfig, 'values'>): boolean {
  return config.values.tui.endpoint === ''
}
