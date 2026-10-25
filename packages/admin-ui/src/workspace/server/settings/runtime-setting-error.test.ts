import { expect, it } from 'vitest'
import { runtimeSettingError } from './runtime-setting-error'

it.each(['', ' ', '-1', '65536', '1337.5', 'invalid', Infinity])(
  'rejects invalid listener port %s with an actionable message',
  (value) => {
    expect(runtimeSettingError({ path: 'admin.port', type: 'number', min: 0, max: 65535 }, value)).toBe(
      'Enter a whole number from 0 to 65535.'
    )
  }
)
it.each([0, 1337, '65535'])('accepts valid listener port %s', (value) => {
  expect(runtimeSettingError({ path: 'admin.port', type: 'number', min: 0, max: 65535 }, value)).toBe('')
})
it('keeps fractional non-port settings permitted by their schema', () => {
  expect(runtimeSettingError({ path: 'log.maxSizeMb', type: 'number', min: 1, max: 1024 }, '1.5')).toBe('')
  expect(runtimeSettingError({ path: 'proxy.url', type: 'string' }, '')).toBe('')
})
