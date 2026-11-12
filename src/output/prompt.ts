/**
 * Questions to the person. Interactive on a terminal; without one, `--yes` answers safe
 * confirmations and dangerous ones alike (the person chose it on the command line), and anything
 * else fails with a code the caller can explain.
 */

import { AtcError } from '../errors/index.js'
import type { AtcIo } from '../io.js'

export interface Prompter {
  confirm(question: string, options?: { danger?: boolean; defaultYes?: boolean }): Promise<boolean>
}

export function createPrompter(io: AtcIo, flags: { yes: boolean; json: boolean }): Prompter {
  const interactive = io.isTTY.stdin && !flags.json
  return {
    async confirm(question, options = {}) {
      if (!interactive) {
        if (flags.yes) return true
        throw new AtcError('ATC_CONSENT_REQUIRED', `${question} — needs a confirmation.`, {
          hint: options.danger
            ? 're-run with --yes to confirm this change'
            : 're-run with --yes, or from a terminal',
        })
      }
      const suffix = options.defaultYes ? '[Y/n]' : '[y/N]'
      const answer = (await io.question(`${question} ${suffix} `)).trim().toLowerCase()
      if (answer === '') return options.defaultYes === true
      return answer === 'y' || answer === 'yes'
    },
  }
}
