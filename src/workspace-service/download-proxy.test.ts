import { expect, it } from 'vitest'
import { defaultConfig } from '../config/index.js'
import { downloadProxy } from './download-proxy.js'

it.each([
  [{ noProxy: [], ignoreSsl: false }, null],
  [
    { url: 'http://proxy:3128', noProxy: ['localhost'], ignoreSsl: true },
    { url: 'http://proxy:3128', no_proxy: ['localhost'], ignore_ssl: true },
  ],
])('maps proxy config %j', (proxy, expected) => {
  expect(downloadProxy({ ...defaultConfig(), proxy })).toEqual(expected)
})
