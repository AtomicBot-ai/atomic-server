import { describe, expect, it } from 'vitest'
import type { IssuedKey } from './remote-store.js'
import { ENDED_SHOWN, ENDED_SHOWN_MS, recentEnded, withEnded } from './host-ended.js'

const key = (grant_id: string, client_name: string | null = 'iPad'): IssuedKey => ({
  grant_id,
  client_device_id: 'd',
  client_name,
  client_platform: 'ios',
  api_key: 'k',
  grant_secret: 's',
  issued_at: 0,
})

describe('devices whose access ended from their side', () => {
  it('lists the newest first, with clean names, and at most a few', () => {
    const first = withEnded([], [key('a')], 10)
    const next = withEnded(first, [key('b', 'Pixel\u0007'), key('c', null)], 20)
    expect(next.map((e) => [e.grant_id, e.device_name, e.at])).toEqual([
      ['b', 'Pixel', 20],
      ['c', null, 20],
      ['a', 'iPad', 10],
    ])
    const many = withEnded(
      next,
      ['d', 'e', 'f'].map((id) => key(id)),
      30
    )
    expect(many).toHaveLength(ENDED_SHOWN)
    expect(many.at(-1)?.grant_id).toBe('c')
  })

  it('announces only the last few minutes', () => {
    const list = withEnded(withEnded([], [key('old')], 0), [key('new')], ENDED_SHOWN_MS)
    expect(recentEnded(list, ENDED_SHOWN_MS + 1).map((e) => e.grant_id)).toEqual(['new'])
  })
})
