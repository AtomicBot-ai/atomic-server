import { AtcError, defineCommand, renderCompletion, SHELLS } from '../../cli/index.js'
import type { Shell } from '../../cli/index.js'

export const completionCommand = defineCommand({
  name: 'completion',
  summary: 'Print a shell completion script (bash, zsh, fish, powershell)',
  group: 'system',
  positionals: [{ name: 'shell', description: SHELLS.join(' | '), required: true }],
  examples: [
    'atc completion bash > ~/.local/share/bash-completion/completions/atc',
    'atc completion zsh > "${fpath[1]}/_atc"',
  ],
  run: async (inv, ctx) => {
    const shell = inv.positionals[0] as string
    if (!SHELLS.includes(shell as Shell))
      throw new AtcError('ATC_USAGE', `Unknown shell '${shell}'.`, {
        details: `choices: ${SHELLS.join(', ')}`,
      })
    ctx.io.stdout(renderCompletion(ctx.root, shell as Shell))
    return 0
  },
})
