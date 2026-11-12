import { afterEach, describe, expect, it, vi } from 'vitest'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { createServiceHub } from '@/services'
import { jsonResponse, statusFixture } from '@/test/fixtures'
import { useStatusStore } from './status-store'

describe('status store', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useStatusStore.getState().reset()
  })

  it('refresh() fetches /api/status into the store', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, statusFixture()))
    vi.stubGlobal('fetch', fetchMock)
    initializeServiceHubStore(createServiceHub())

    await useStatusStore.getState().refresh()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/status')
    expect(useStatusStore.getState().status?.daemon.pid).toBe(4242)
    expect(useStatusStore.getState().error).toBeNull()
    expect(useStatusStore.getState().unauthorized).toBe(false)
    expect(useStatusStore.getState().updatedAt).not.toBeNull()
  })

  it('reset() clears the status', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(200, statusFixture()))
    vi.stubGlobal('fetch', fetchMock)
    initializeServiceHubStore(createServiceHub())
    await useStatusStore.getState().refresh()

    useStatusStore.getState().reset()

    expect(useStatusStore.getState().status).toBeNull()
    expect(useStatusStore.getState().updatedAt).toBeNull()
    expect(useStatusStore.getState().loading).toBe(false)
  })

  it('a 401 flips unauthorized instead of an error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(401, {}))
    vi.stubGlobal('fetch', fetchMock)
    initializeServiceHubStore(createServiceHub())

    await useStatusStore.getState().refresh()

    expect(useStatusStore.getState().unauthorized).toBe(true)
    expect(useStatusStore.getState().error).toBeNull()
  })
})
