import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../../contract/index.js'
import { reminderSet } from './reminder.js'

const snapshot = (status: string, setupId = 's1', model = 'Qwen') =>
  ({
    setups: [{ setup_id: 's1', stage: 'downloading_model', plan: { model_id: 'Qwen' } }],
    reminder: { setup_id: setupId, model, model_name: 'Qwen', status, registered_at: 1 },
  }) as unknown as WorkspaceSnapshot

it.each([
  ['a waiting reminder of this download', snapshot('waiting'), true],
  ['a queued one', snapshot('queued'), true],
  ['another setup of the same model', snapshot('waiting', 's0'), true],
  ['another model', snapshot('waiting', 's0', 'Other'), false],
  ['an expired one', snapshot('expired'), false],
  ['a failed one', snapshot('failed'), false],
  ['none', { setups: [] } as unknown as WorkspaceSnapshot, false],
])('says %s is set: %s', (_, value, expected) => expect(reminderSet(value)).toBe(expected))
