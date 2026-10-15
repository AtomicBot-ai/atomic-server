import type { AtcConfig } from '../config/index.js'
import type { ProxyConfig } from '../downloads/index.js'

/** The `proxy.*` config as the downloader takes it; `null` when no proxy is set. */
export function downloadProxy(config: AtcConfig): ProxyConfig | null {
  const { url, noProxy, ignoreSsl } = config.proxy
  return url ? { url, no_proxy: noProxy, ignore_ssl: ignoreSsl } : null
}
