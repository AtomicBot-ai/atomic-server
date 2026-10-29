import { expect, it } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { settingValuesError } from './settings-validation.js'
const fields = settingsSchema('llamacpp-upstream')
it.each([
  [{ flash_attn: 'wrong' }, 'flash_attn'],
  [{ cache_type_k: 'wrong' }, 'cache_type_k'],
  [{ threads: '4' }, 'threads'],
  [{ threads: NaN }, 'threads'],
  [{ threads: null }, 'threads'],
  [{ concurrent_slots: 1 }, 'concurrent_slots'],
  [{ mtp: 'false' }, 'mtp'],
  [{ extra_args: {} }, 'extra_args'],
  [{ unknown: true }, 'unknown'],
])('rejects invalid typed settings %j', (values, key) => {
  expect(settingValuesError(values, fields)).toContain(key)
})
it('accepts exported defaults, numeric edits, enums and booleans', () => {
  const defaults = Object.fromEntries(
    fields.filter((f) => f.key !== 'version_backend').map((f) => [f.key, f.controllerProps.value])
  )
  expect(settingValuesError(defaults, fields)).toBeUndefined()
  expect(
    settingValuesError({ threads: 4, timeout: 60, flash_attn: 'off', mtp: true }, fields)
  ).toBeUndefined()
})
