import { describe, expect, it } from 'vitest'
import { updateNotice } from './update-notice.js'

describe('the notice that a newer atc is out', () => {
  it('names the versions and what installs it', () => {
    expect(
      updateNotice({
        version: '0.2.4',
        checked_at: 1,
        update: { version: '0.3.0', url: 'https://example.test/v0.3.0', command: 'atc update' },
      })
    ).toBe('atc 0.3.0 is out (you run 0.2.4): run `atc update`')
  })

  it('points at the release when nothing installs it here', () => {
    expect(
      updateNotice({
        version: '0.2.4',
        checked_at: 1,
        update: { version: '0.3.0', url: 'https://example.test/v0.3.0', command: null },
      })
    ).toBe('atc 0.3.0 is out (you run 0.2.4): https://example.test/v0.3.0')
  })

  it('is silent without a server, before a look, and when up to date', () => {
    expect(updateNotice(undefined)).toBeNull()
    expect(updateNotice({ version: '0.2.4', checked_at: null, update: null })).toBeNull()
    expect(updateNotice({ version: '0.2.4', checked_at: 1, update: null })).toBeNull()
  })
})
