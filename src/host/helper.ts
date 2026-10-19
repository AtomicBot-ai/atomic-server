/**
 * `atc host-step exec <request.json>`: the privileged half. It runs the core's executor — the same
 * code the desktop app and `atomic-chat-core host-step exec` run — which reads the request, refuses
 * it unless the recipe, its digests and parameters match this build, brings the machine to what the
 * recipe describes, and writes `<step_id>.result.json` beside the request. It never opens the
 * control API and never trusts anything but the file. On Linux it trusts only a request folder owned
 * by the invoking user (`SUDO_UID`, `PKEXEC_UID`) with mode 0700; on Windows only an owner-only ACL.
 */

import { AtomicCoreError } from '@atomic-chat/core'
import { executeHostStep, nodeHostStepDeps, windowsHostStepDeps } from '@atomic-chat/core/host'
import type { HostStepExecutorDeps, HostStepResult } from '@atomic-chat/core/host'
import { AtcError } from '../errors/index.js'

export interface HelperOptions {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** The core's executor; tests pass a fake. */
  execute?: (requestPath: string, deps: HostStepExecutorDeps) => Promise<HostStepResult>
}

/**
 * Run one request. Every refusal or failure the executor can describe is a `failed` result file; it
 * throws only when it cannot write one at all (an untrusted folder, not a `*.request.json`), which is
 * a usage error here: the person ran it on the wrong file or as the wrong user.
 */
export async function runHostStepHelper(
  requestPath: string,
  options: HelperOptions
): Promise<HostStepResult> {
  const execute = options.execute ?? executeHostStep
  const deps = options.platform === 'win32' ? windowsHostStepDeps(options.env) : nodeHostStepDeps(options.env)
  try {
    return await execute(requestPath, deps)
  } catch (error) {
    if (error instanceof AtomicCoreError && error.code === 'MANAGED_HOST_STEP_INVALID')
      throw new AtcError('ATC_USAGE', error.message, {
        hint: 'run it on the request file the server wrote, as the user it named (e.g. with sudo)',
      })
    throw error
  }
}
