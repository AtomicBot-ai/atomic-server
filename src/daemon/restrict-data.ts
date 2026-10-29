import { chmod, mkdir } from 'node:fs/promises'
import { AtcError } from '../errors/index.js'
import { restrictToOwner } from '../host/index.js'
import type { HostServices } from '../host/index.js'
import type { Logger } from '../output/index.js'

/** Owner-only data folder, or a start failure. A warning is not enough: keys would be written anyway. */
export async function restrictDataFolder(
  dir: string,
  host: HostServices,
  env: NodeJS.ProcessEnv,
  log: Logger
): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 })
  if (host.facts.platform !== 'win32') {
    try {
      await chmod(dir, 0o700)
    } catch (error) {
      throw restrictError(error instanceof Error ? error.message : String(error))
    }
    return
  }
  const user = env['USERDOMAIN'] ? `${env['USERDOMAIN']}\\${host.facts.username}` : host.facts.username
  const denied = await restrictToOwner(dir, {
    platform: host.facts.platform,
    user,
    exec: host.exec,
    systemRoot: env['SystemRoot'] ?? env['SYSTEMROOT'],
    env,
    checked: (problem) =>
      problem
        ? log.warn(`could not restrict ${dir} to this user: ${problem}`)
        : log.info(`restricted ${dir} to this user`),
  })
  if (denied) throw restrictError(denied)
}

function restrictError(details: string): AtcError {
  return new AtcError('ATC_DAEMON_START_FAILED', 'Could not restrict the data folder to this user.', {
    details,
    hint: 'fix the permissions on the data folder and start again',
  })
}
