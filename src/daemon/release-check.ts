/**
 * The server's look at atc releases (`src/update/release-watch.ts`), built from what this machine is:
 * a packaged atc names its package manager, a release binary names `atc update`, a source tree nothing.
 */

import type { HostServices } from '../host/index.js'
import type { AtcIo } from '../io.js'
import type { Logger } from '../output/index.js'
import { installCommand, readInstallSource, ReleaseWatch } from '../update/index.js'
import { ATC_TARGET, ATC_VERSION } from '../version.js'

export async function serverReleaseWatch(options: {
  io: AtcIo
  host: HostServices
  log: Logger
}): Promise<ReleaseWatch> {
  const { io, host, log } = options
  const execPath = host.selfCommand[0] ?? process.execPath
  const source = await readInstallSource(io.readFile, host.facts.platform, execPath)
  return new ReleaseWatch({
    fetch: io.fetch,
    current: ATC_VERSION,
    command: installCommand(source, ATC_TARGET),
    api: io.env['ATC_GITHUB_API'],
    log: (message) => log.debug(message),
  })
}
