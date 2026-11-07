// Stage only installer targets. Bun can emit adjacent .map files for compiled executables.
import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { TARGETS } from './targets.mjs'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(version ?? '')) throw new Error('Expected a release version')
mkdirSync('release')
for (const { triple, platform } of TARGETS) {
  const suffix = triple + (platform === 'win32' ? '.exe' : '')
  copyFileSync(join('bin', 'atc-' + suffix), join('release', `atc-${version}-${suffix}`))
}
