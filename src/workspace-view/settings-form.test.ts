import type { SettingDescriptor } from '@atomic-chat/core/contracts'
import { describe, expect, it } from 'vitest'
import { parseSettingValue } from './settings-form.js'

const input = (props: Record<string, unknown>): SettingDescriptor => ({
  key: 'k',
  title: 'K',
  description: '',
  controllerType: 'input',
  controllerProps: { value: '', ...props },
})
const NUMBER = input({ type: 'number', min: 0, max: 0.99 })
const TEXT = input({ type: 'text' })
const CHECKBOX: SettingDescriptor = { ...TEXT, controllerType: 'checkbox', controllerProps: { value: false } }
const DROPDOWN: SettingDescriptor = {
  ...TEXT,
  controllerType: 'dropdown',
  controllerProps: { value: 'auto', options: [{ value: 'auto' }, { value: 'fp8' }] },
}

describe('parseSettingValue', () => {
  it.each([
    [NUMBER, '0.5', { value: 0.5 }],
    [NUMBER, '1.5', { error: 'between 0 and 0.99' }],
    [NUMBER, '-1', { error: 'between 0 and 0.99' }],
    [NUMBER, 'abc', { error: 'a number' }],
    [input({ type: 'number', min: 1 }), '7', { value: 7 }],
    [input({ type: 'number', min: 1 }), '0', { error: 'at least 1' }],
    [TEXT, 'GPU-1', { value: 'GPU-1' }],
    [TEXT, '', { value: '' }],
    [CHECKBOX, 'true', { value: true }],
    [CHECKBOX, 'off', { value: false }],
    [CHECKBOX, 'maybe', { error: 'true or false' }],
    [DROPDOWN, 'fp8', { value: 'fp8' }],
    [DROPDOWN, 'int4', { error: 'one of auto, fp8' }],
  ])('%#: %j', (descriptor, raw, expected) => {
    const result = parseSettingValue(descriptor, raw)
    if ('error' in expected) expect((result as { error: string }).error).toContain(expected.error)
    else expect(result).toEqual(expected)
  })
})
