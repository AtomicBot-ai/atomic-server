/**
 * How the running binary gets replaced, per platform: POSIX renames over the inode in use; Windows
 * cannot, so the running file is moved aside first and cleaned up on the next run.
 */

import { AtcError } from '../errors/index.js'
import { assetName, targetByTriple, targetFor } from './targets.js'

export interface ReplacePlan {
  steps: Array<
    | { op: 'rename'; from: string; to: string }
    | { op: 'chmod'; path: string; mode: number }
    | { op: 'cleanup'; glob: string }
  >
}

export function planReplace(
  platform: NodeJS.Platform,
  execPath: string,
  downloaded: string,
  stamp: string
): ReplacePlan {
  if (platform === 'win32') {
    return {
      steps: [
        { op: 'rename', from: execPath, to: `${execPath}.old-${stamp}` },
        { op: 'rename', from: downloaded, to: execPath },
        { op: 'cleanup', glob: `${execPath}.old-*` },
      ],
    }
  }
  return {
    steps: [
      { op: 'chmod', path: downloaded, mode: 0o755 },
      { op: 'rename', from: downloaded, to: execPath },
    ],
  }
}

/**
 * The release asset for this machine, as the release workflow names it: the variant this binary was
 * built as (`builtFor`, its baked-in triple) when known, otherwise the default build for the platform.
 */
export function assetNameFor(
  version: string,
  platform: NodeJS.Platform,
  arch: string,
  builtFor?: string
): string {
  const target = (builtFor ? targetByTriple(builtFor) : undefined) ?? targetFor(platform, arch)
  if (!target)
    throw new AtcError('ATC_UNSUPPORTED_PLATFORM', `No atc build is published for ${platform}/${arch}.`)
  return assetName(version, target)
}
