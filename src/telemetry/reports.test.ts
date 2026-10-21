import { AtomicCoreError } from '@atomic-chat/core'
import { describe, expect, it } from 'vitest'
import { DownloadRequestError } from '../downloads/index.js'
import { AtcError } from '../errors/index.js'
import { adminFailureReport, adminRoute, downloadFailureReport, startupFailureReport } from './reports.js'

const coded = (code: string, message = code) => Object.assign(new Error(message), { code })

describe('downloadFailureReport', () => {
  it.each([
    ['a cancel', new Error('Download cancelled'), null],
    ['a cancelled verification', new Error('Validation cancelled'), null],
    ['a gated repository without a token', new Error('Failed to download: HTTP status 401, '), null],
    ['a refused repository', new Error('Failed to download: HTTP status 403, nope'), null],
    ['a full disk', new Error('Error: [disk_full] Not enough free disk space: 5 GB needed'), null],
    ['a missing file', new Error('Failed to download: HTTP status 404, '), 'error http_404'],
    [
      'a server failing past the retries',
      new Error('Failed to download: HTTP status 503, '),
      'warning http_5xx',
    ],
    ['another refusal', new Error('Failed to download: HTTP status 410, '), 'error http_other'],
    [
      'a disk that refuses writes',
      new Error('Error: [disk_permission] EACCES: denied'),
      'warning disk_permission',
    ],
    [
      'a corrupt file',
      new Error('Hash verification failed. The downloaded file is corrupted or has been tampered with.'),
      'error checksum_mismatch',
    ],
    [
      'a short file',
      new Error('Size verification failed. Expected 5 bytes but got 4 bytes.'),
      'error size_mismatch',
    ],
    [
      'a stream that kept dropping',
      new Error('Download failed after 5 retries at byte 9: terminated'),
      'warning network',
    ],
    ['a reset connection', coded('ECONNRESET', 'read ECONNRESET'), 'warning network'],
    ['fetch giving up', new TypeError('fetch failed'), 'warning network'],
    [
      'a proxy tunnel',
      Object.assign(new Error('CONNECT refused'), { name: 'ProxyTunnelError' }),
      'warning proxy',
    ],
    ['a bad proxy setting', coded('PROXY_CONFIG_INVALID', 'Error: Unsupported proxy scheme: ftp'), null],
    [
      'a typed status whatever the message says',
      new DownloadRequestError('fatal', 'Resume refused', 404),
      'error http_404',
    ],
    [
      'a path outside the data folder that names a proxy',
      new Error('Path /srv/proxy-cache/m is outside of the data folder /d'),
      'error path_guard',
    ],
    [
      'a path outside the data folder',
      new Error('Path /x is outside of the data folder /d'),
      'error path_guard',
    ],
    ['anything else', new Error('boom'), 'error unknown'],
  ] as const)('%s', (_name, error, expected) => {
    const report = downloadFailureReport(error)
    expect(report && `${report.level} ${String(report.tags?.['failure_reason'])}`).toBe(expected)
  })

  it('groups a known cause as one issue and leaves an unknown one to its stack', () => {
    expect(downloadFailureReport(new Error('Failed to download: HTTP status 404, '))).toMatchObject({
      fingerprint: ['download-failure', 'http_404'],
      tags: { component: 'downloads', http_status: 404 },
    })
    expect(downloadFailureReport(new Error('boom'))?.fingerprint).toBeUndefined()
  })
})

describe('adminFailureReport', () => {
  const report = (error: unknown, status = 500) =>
    adminFailureReport({ error, status, method: 'POST', path: '/api/workspace/models/qwen3-8b?x=1' })

  it('reports a bug behind the admin API with the route, never the path', () => {
    expect(report(new TypeError('x is undefined'))).toMatchObject({
      level: 'error',
      tags: { component: 'admin', route: 'POST /api/workspace/models/:id', http_status: 500 },
    })
  })

  it.each([
    ['an answer atc gives on purpose', new AtcError('ATC_USAGE', 'no'), 500],
    ['the core answering (it reports its own)', new AtomicCoreError('CORE_NOT_RUNNING', 'down'), 502],
    ['a client that hung up', coded('ECONNRESET'), 500],
    ['anything under 500', new Error('x'), 404],
  ] as const)('leaves out %s', (_name, error, status) => {
    expect(report(error, status)).toBeNull()
  })

  it('reports an AtcError that names a bug', () => {
    expect(report(new AtcError('ATC_INTERNAL', 'oops'))).not.toBeNull()
  })
})

describe('adminRoute', () => {
  it.each([
    ['/api/status', 'GET /api/status'],
    ['/api/workspace/models/qwen3-8b', 'GET /api/workspace/models/:id'],
    ['/api/engines/llamacpp/schema/extra/more', 'GET /api/engines/llamacpp/schema'],
    ['/api/jobs/3f2a-11', 'GET /api/jobs/:id'],
  ])('%s', (path, expected) => {
    expect(adminRoute('GET', path)).toBe(expected)
  })
})

describe('startupFailureReport', () => {
  it('reports a server that could not start as fatal', () => {
    expect(startupFailureReport(new Error('boom'))).toMatchObject({
      source: 'startup',
      level: 'fatal',
      tags: { component: 'daemon' },
    })
  })

  it.each([
    ['an answer atc gives on purpose', new AtcError('ATC_ADMIN_BIND_FAILED', 'port taken')],
    ['an owner already running', new AtomicCoreError('CORE_ALREADY_RUNNING', 'owned')],
  ])('leaves out %s', (_name, error) => {
    expect(startupFailureReport(error)).toBeNull()
  })
})
