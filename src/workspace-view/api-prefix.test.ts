import { expect, it } from 'vitest'
import { apiPrefixError } from './api-prefix.js'
it.each(['/', '/v1', '/qa/v1', '/api-v1/', '/api_1/v1.2~test'])('accepts %s as a literal route', (value) => {
  expect(apiPrefixError(value)).toBeUndefined()
})
it.each(['', 'v1', '/qa v1', '/qa?x', '/qa#x', '/qa%20v1', '/qa//v1', '/qa/../v1', '/тест'])(
  'rejects %s',
  (value) => {
    expect(apiPrefixError(value)).toContain('prefix')
  }
)
