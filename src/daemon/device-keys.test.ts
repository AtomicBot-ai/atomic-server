import { describe, expect, it } from 'vitest'
import { withDeviceKeys } from './device-keys.js'

describe('withDeviceKeys', () => {
  it.each([
    [undefined, ['atc_dev'], undefined],
    [[], [], []],
    [['atc_own'], [], ['atc_own']],
    [['atc_own'], ['atc_dev'], ['atc_own', 'atc_dev']],
    // A keyring that refuses everyone (a damaged file) still takes the keys this server issued to devices.
    [[], ['atc_dev'], ['atc_dev']],
  ])('keyring %j with devices %j accepts %j', (keyring, devices, expected) => {
    expect(withDeviceKeys(keyring, devices)).toEqual(expected)
  })
})
