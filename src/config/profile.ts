/** The API default for profiles that have never saved config.json. */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AtcPaths } from './paths.js'
import { resolveConfig } from './resolve.js'
import { defaultConfig } from './schema.js'

// Old servers always created a keyring and a server log. A detached first start by any version
// already has atc/logs/daemon.out.log, so the directory and the launcher's log are not evidence.
function usedLegacyDefaults(paths: AtcPaths) {
  return existsSync(join(paths.atcDir, 'client-keys.json')) || existsSync(paths.daemonLog)
}

const newDefaultsMarker = (paths: AtcPaths) => join(paths.atcDir, 'profile-v6')

/** Record a fresh server before it creates its log or keyring. An empty marker is atomic and idempotent. */
export async function initializeProfileDefaults(paths: AtcPaths) {
  if (usedLegacyDefaults(paths)) return
  await mkdir(paths.atcDir, { recursive: true, mode: 0o700 })
  await writeFile(newDefaultsMarker(paths), '', { flag: 'a' })
}

/** Read-only commands see the same port as the next server start, even before a config edit. */
export async function loadProfileConfig(paths: AtcPaths, env: NodeJS.ProcessEnv) {
  try {
    const fileText = await readFile(paths.configFile, 'utf8')
    return resolveConfig({ fileText, env })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    // Check the marker last: another first start publishes it before creating the keyring.
    const defaults = defaultConfig()
    if (usedLegacyDefaults(paths) && !existsSync(newDefaultsMarker(paths))) defaults.api.port = 1337
    return resolveConfig({ defaults, env })
  }
}
