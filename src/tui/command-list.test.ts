import { describe, expect, it } from 'vitest'
import { ROOT } from '../commands/index.js'
import { commandRows } from './command-list.js'

describe('commandRows', () => {
  it('marks every row as working or a bare group', () => {
    for (const row of commandRows(ROOT)) {
      expect(['works', 'group'], `${row.path.join(' ')} has status ${row.status}`).toContain(row.status)
    }
  })
})
