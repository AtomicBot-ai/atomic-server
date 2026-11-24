import { expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { prepareStrata, StrataPreparationFailed, strataServerStopped } from './preparation.js'

const request = { request_id: 'prep', model_id: 'model', source_digest: 'a'.repeat(64) }
const opened = { ...request, operation_id: 'job', state: 'preparing', revision: 1, error: null }

it('confirms the preparation stopped when cancellation crosses the core begin response', async () => {
  const link = fakeCoreLink()
  const controller = new AbortController()
  link.responses['POST /strata/preparations'] = () => {
    controller.abort()
    return opened
  }
  link.responses['POST /strata/preparations/job/cancel'] = { ...opened, state: 'cancelled', revision: 2 }
  await expect(prepareStrata(link, request, controller.signal)).rejects.toBeInstanceOf(
    StrataPreparationFailed
  )
  expect(link.calls.at(-1)).toMatchObject({ method: 'POST', path: '/strata/preparations/job/cancel' })
})

it('leaves the core operation intact when the atc process stops following it', async () => {
  const link = fakeCoreLink()
  const controller = new AbortController()
  const cancelled = vi.fn()
  link.responses['POST /strata/preparations/job/cancel'] = cancelled
  link.responses['POST /strata/preparations'] = () => {
    controller.abort(strataServerStopped)
    return opened
  }
  await expect(prepareStrata(link, request, controller.signal)).rejects.toBe(strataServerStopped)
  expect(cancelled).not.toHaveBeenCalled()
})
