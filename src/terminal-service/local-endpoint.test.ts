import { expect, it } from 'vitest'
import { defaultConfig, resolveConfig } from '../config/index.js'
import { followsLocalServer } from './local-endpoint.js'

const DEFAULT = defaultConfig().tui.endpoint

it.each([
  ['default', DEFAULT, true],
  // Any config edit writes the whole file, defaults included: the saved default is still no choice.
  ['file', DEFAULT, true],
  ['flag', DEFAULT, true],
  // An `ATC_TUI_ENDPOINT` names that address on purpose, even when it is the default one.
  ['env', DEFAULT, false],
  ['file', 'http://127.0.0.1:62732/v1', false],
  ['file', 'https://openrouter.ai/api/v1', false],
] as const)('a %s endpoint %s follows this server: %s', (source, endpoint, follows) => {
  const config = resolveConfig({ env: {}, flags: { 'tui.endpoint': endpoint } })
  config.sources['tui.endpoint'] = source
  expect(followsLocalServer(config)).toBe(follows)
})
