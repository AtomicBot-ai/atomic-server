import type { WorkspaceInput, WorkspaceOperation, WorkspaceSnapshot } from '@contract'
import { request } from '@/services/admin-api'
export const workspaceApi = {
  snapshot: () => request<WorkspaceSnapshot>('GET', '/api/workspace'),
  execute: <T = unknown>(operation: string, input: WorkspaceInput = {}) =>
    request<T>('POST', '/api/workspace/execute', { operation, input }),
  operations: () =>
    request<WorkspaceOperation[]>('POST', '/api/workspace/execute', {
      operation: 'operations.list',
      input: {},
    }),
}
