import { defineCommand } from '../cli/index.js'
import { ADMIN_BUILD_ID } from '../admin/index.js'
import { ATC_BUILD_DATE, ATC_GIT_SHA, ATC_VERSION, CORE_VERSION } from '../version.js'

export const versionCommand = defineCommand({
  name: 'version',
  summary: 'Print the atc, core and admin versions',
  group: 'system',
  run: async (_inv, ctx) => {
    const build = [ATC_GIT_SHA, ATC_BUILD_DATE].filter(Boolean).join(', ')
    ctx.out.result(
      {
        atc: ATC_VERSION,
        git_sha: ATC_GIT_SHA ?? null,
        build_date: ATC_BUILD_DATE ?? null,
        core: CORE_VERSION,
        admin_ui: ADMIN_BUILD_ID,
        platform: process.platform,
        arch: process.arch,
      },
      () => {
        ctx.out.line(`atc ${ATC_VERSION}${build ? ` (${build})` : ''}`)
        ctx.out.line(`core ${CORE_VERSION}`)
        ctx.out.line(`admin-ui ${ADMIN_BUILD_ID}`)
        ctx.out.line(`${process.platform} ${process.arch}`)
      }
    )
    return 0
  },
})
