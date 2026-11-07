import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { fastFlowLmHostRequest, fastFlowLmHostReceipt } from '@atomic-chat/core/client'
import type { FastFlowLmOperation } from '@atomic-chat/core/contracts'
import wire from '../fixtures/fastflowlm/operation.json' with { type: 'json' }
it('preserves the UTF-8 request digest and a bound service receipt under Node and Bun', async () => {
  const op = wire as FastFlowLmOperation,
    step = op.pending_host_step!
  const request = await fastFlowLmHostRequest(op, '/tmp/данные')
  expect(createHash('sha256').update(request.text).digest('hex')).toBe(request.sha256)
  const receipt = fastFlowLmHostReceipt(op, 'receipt', {
    ...step,
    operation_id: op.operation_id,
    schema_version: 1,
    error_code: null,
    log_tail: '',
    exit_code: 0,
    outcome: 'completed',
  })
  expect(receipt.nonce).toBe(step.nonce)
})
