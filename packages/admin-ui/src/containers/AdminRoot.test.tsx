import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { createServiceHub } from '@/services'
import type { EventSourceFactory } from '@/services/events'
import { useStatusStore } from '@/stores/status-store'
import { FakeEventSource } from '@/test/fake-event-source'
import { AdminRoot } from './AdminRoot'

vi.mock('@/workspace', () => ({ WorkspaceApp: () => <div>the workspace</div> }))

const STATUS = { atc: { version: '0' }, core: {}, daemon: {}, admin: {}, api: {}, sessions: [] }
let signedIn = false
let logins: string[] = []

beforeEach(() => {
  signedIn = false
  logins = []
  useStatusStore.setState({ status: null, loading: false, error: null, unauthorized: false, updatedAt: null })
  initializeServiceHubStore(
    createServiceHub({ eventSource: FakeEventSource as unknown as EventSourceFactory })
  )
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.endsWith('/api/session') && init?.method === 'POST') {
      logins.push(JSON.parse(String(init.body)).token)
      signedIn = true
      return new Response(null, { status: 204 })
    }
    if (url.endsWith('/api/status'))
      return signedIn
        ? new Response(JSON.stringify(STATUS), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(JSON.stringify({ error: { code: 'ATC_ADMIN_UNAUTHORIZED', message: 'no' } }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          })
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

// A login link opened in a tab that already shows the sign-in screen only changes the hash: it must
// still trade the token, like a fresh load does.
it('signs in when a #token= arrives in an open tab', async () => {
  render(<AdminRoot />)
  expect(await screen.findByRole('heading', { name: 'Sign in to atc admin' })).toBeInTheDocument()
  await act(async () => {
    window.location.hash = '#token=late-token'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await Promise.resolve()
  })
  expect(await screen.findByText('the workspace')).toBeInTheDocument()
  expect(logins).toEqual(['late-token'])
  expect(window.location.hash).toBe('')
})
