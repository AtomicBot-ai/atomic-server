import { SETUP_GOALS } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import { setupAction } from './setup-actions.js'
import { libraryAction } from '../library/library-actions.js'
import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'

export async function goalSetupAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (id === 'choose-goal' || (id === 'hosting' && ctx.get().page === 'welcome')) {
    ctx.update((s) => ({ ...s, overlay: 'setup-goal', focus: 'goal:chat', hover: '' }))
    return true
  }
  if (!id.startsWith('goal:')) return false
  const goal = SETUP_GOALS.find((item) => item.id === id.slice(5))
  if (!goal) return true
  ctx.update((s) => ({ ...s, overlay: null, setupGoal: goal.id, message: goal.guidance }))
  if (goal.category === 'text') {
    // Use the existing durable text setup, including its verified readiness check.
    if (ctx.get().setupComplete) {
      await ctx.controller.save('tui.mode', 'server')
      await setupAction('install-models', ctx)
    } else await setupAction('hosting', ctx)
  } else {
    // The shared media catalog reviews compatibility before installing. Opening it
    // records a manual workspace entry, never a successful inference check.
    await ctx.controller.runtime.execute('setup.manual')
    ctx.update((s) => ({
      ...s,
      setupComplete: true,
      setup: null,
      libraryView: 'catalog',
      libraryCategory: goal.category,
    }))
    await libraryAction('library:catalog', ctx)
  }
  ctx.update((s) => ({ ...s, message: goal.guidance }))
  return true
}

export function drawGoalSetup(c: Canvas, focus: string) {
  const x = 3,
    y = 3,
    width = c.width - 6,
    bottom = c.height - 4
  for (let row = y; row <= bottom; row++)
    text(c, x, row, ' '.repeat(width), COLORS.text, width, COLORS.header)
  c.targets = []
  text(c, x + 2, y + 1, 'What should this server power?', COLORS.gold, width - 4)
  SETUP_GOALS.forEach((goal, index) => {
    button(c, `goal:${goal.id}`, x + 2, y + 3 + index, goal.label, goal.guidance, focus)
  })
  text(c, x + 2, bottom - 3, 'Review downloads. Verify the API. Connect your tools.', COLORS.muted, width - 4)
  button(c, 'close', x + 2, bottom - 1, 'Back', 'Return without changing setup', focus)
}
