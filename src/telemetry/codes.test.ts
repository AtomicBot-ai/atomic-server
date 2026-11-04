import { AtomicCoreError } from '@atomic-chat/core'
import { expect, it } from 'vitest'
import { AtcError } from '../errors/index.js'
import { reportCodeOf } from './codes.js'

const coded = (code: string) => Object.assign(new Error('x'), { code })

it.each([
  ['a core code', new AtomicCoreError('OUT_OF_MEMORY', 'x'), 'OUT_OF_MEMORY'],
  ['a system code the core knows', coded('ENOSPC'), 'ENOSPC'],
  ["atc's own error", new AtcError('ATC_UPDATE_FAILED', 'x'), 'ATC_UPDATE_FAILED'],
  ['an atc code on a plain error', coded('ATC_INTERNAL'), 'ATC_INTERNAL'],
  ['a bad proxy setting', coded('PROXY_CONFIG_INVALID'), 'PROXY_CONFIG_INVALID'],
  ['a Hub status', coded('HF_HTTP_429'), 'HF_HTTP_429'],
  ['a code nobody listed', coded('SOME_PRIVATE_THING'), undefined],
  ['a Hub status that is not one', coded('HF_HTTP_4290'), undefined],
  ['no code', new Error('x'), undefined],
])('tags %s', (_name, error, code) => expect(reportCodeOf(error)).toBe(code))
