import type { WorkspaceInput } from '../../contract/index.js'
import { NOT_CORE } from '../not-core.js'
import type { StrataSetups } from './setups.js'

export function strataOperation(setups: StrataSetups, operation: string, input: WorkspaceInput) {
  switch (operation) {
    case 'strata.plan':
      return setups.plan(
        String(input['model']),
        input['refresh'] === true,
        typeof input['import_directory'] === 'string' ? input['import_directory'] : undefined
      )
    case 'strata.install':
      return setups.journal.install(input)
    case 'strata.cancel':
      return setups.cancel(String(input['id']))
    case 'strata.status':
      return setups.list()
    case 'models.remove':
      if (input['store'] === 'strata') return setups.remove(String(input['model_id']))
  }
  return NOT_CORE
}
