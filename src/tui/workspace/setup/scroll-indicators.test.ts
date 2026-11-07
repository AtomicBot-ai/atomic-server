import { expect, it } from 'vitest'
import { newSetup } from '../../../terminal-setup/index.js'
import { createWorkspace } from '../state.js'
import { canvas } from '../draw/canvas.js'
import { drawFirstModel } from './first-model.js'
import { drawSetupBrowser } from './setup-browser.js'
import { drawPathModels } from './engine-setup-view.js'

it.each(['first', 'catalog', 'managed'] as const)(
  'shows hidden models above and below in %s selection',
  (kind) => {
    const s = createWorkspace('setup')
    s.setup = {
      ...newSetup('server'),
      stage: 'models',
      engine: 'llamacpp-upstream|b1|cpu',
      repositories: Array.from({ length: 20 }, (_, i) => ({
        id: `model-${i}`,
        title: `Model ${i}`,
        downloads: 0,
      })),
    }
    if (kind === 'managed')
      s.setup.path = {
        plan: null,
        job: null,
        kind: 'fastflowlm',
        engine: 'fastflowlm',
        rows: s.setup.repositories.map((r) => ({ id: r.id, title: r.title!, detail: '' })),
      }
    for (const selected of [0, 19]) {
      s.selected = selected
      const c = canvas(80, 24)
      if (kind === 'first') drawFirstModel(c, s, `first-model-choice:${selected}`, 0)
      else if (kind === 'catalog') drawSetupBrowser(c, s, 2, 3, 72, 20, `setup-repo:${selected}`)
      else
        drawPathModels(c, s, s.setup, {
          x: 2,
          y: 3,
          width: 72,
          bottom: 20,
          focus: `setup-path-repo:${selected}`,
        })
      const screen = c.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
      expect(screen).toMatch(selected === 0 ? /v \d+ below/ : /\^ \d+ above/)
      expect(screen).not.toMatch(selected === 0 ? /\^ \d+ above/ : /v \d+ below/)
    }
  }
)
