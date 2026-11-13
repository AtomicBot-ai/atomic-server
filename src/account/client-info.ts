/** What this server tells the account service about itself on every sign-in: the backend's `client` object. */

export const CLIENT_TYPE = 'server'
const MAX_DEVICE_NAME = 100

export interface ClientInfo {
  client_type: typeof CLIENT_TYPE
  device_name?: string
  platform?: string
  app_version?: string
  installation_id: string
}

/** The machine's name as people know it: no control characters, no `.local`, at most 100 characters. */
export function deviceName(hostname: string): string | undefined {
  const name = hostname
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\.local$/i, '')
    .trim()
  return name ? [...name].slice(0, MAX_DEVICE_NAME).join('') : undefined
}

/** `atc-<node platform>`, as the model-ready email already sends it; the backend allows `[a-z0-9_-]{1,32}`. */
export function serverPlatform(platform: string | undefined): string | undefined {
  const value = platform ? `atc-${platform}`.toLowerCase() : ''
  return /^[a-z0-9_-]{1,32}$/.test(value) ? value : undefined
}

/** The version, when the backend's pattern takes it; a build string it would refuse is left out. */
export function appVersion(version: string): string | undefined {
  const value = version.trim()
  return /^[A-Za-z0-9._+-]{1,32}$/.test(value) ? value : undefined
}

export function clientInfo(facts: {
  installationId: string
  hostname?: string
  platform?: string
  version: string
}): ClientInfo {
  const name = facts.hostname ? deviceName(facts.hostname) : undefined
  const platform = serverPlatform(facts.platform)
  const version = appVersion(facts.version)
  return {
    client_type: CLIENT_TYPE,
    ...(name ? { device_name: name } : {}),
    ...(platform ? { platform } : {}),
    ...(version ? { app_version: version } : {}),
    installation_id: facts.installationId,
  }
}
