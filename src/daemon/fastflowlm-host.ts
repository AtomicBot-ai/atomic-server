import { FastFlowLmHostSteps, probedFacts } from '../host/index.js'
import type { HostServices } from '../host/index.js'
import type { CoreLink } from '../core-link/index.js'
import type { AtcPaths } from '../config/index.js'
import type { Logger } from '../output/index.js'
export async function followFastFlowLmHost(paths: AtcPaths, link: CoreLink, host: HostServices, log: Logger) {
  const steps = new FastFlowLmHostSteps({
    atcDir: paths.atcDir,
    dataFolder: paths.dataFolder,
    link,
    elevator: host.elevator,
    context: { ...(await probedFacts(host.facts, host.exec)), inDaemon: true },
  })
  const poll = () => {
    void steps.poll().catch((e: unknown) => log.warn('FastFlowLM host step: ' + String(e)))
  }
  const timer = setInterval(poll, 2000)
  timer.unref?.()
  poll()
  return () => clearInterval(timer)
}
