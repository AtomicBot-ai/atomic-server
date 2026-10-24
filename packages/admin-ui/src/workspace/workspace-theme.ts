import type { CSSProperties } from 'react'
import { WORKSPACE_COLORS } from '@contract'

/** These are the same semantic values consumed by the terminal renderer. */
export const workspaceTheme = Object.fromEntries(
  Object.entries(WORKSPACE_COLORS).map(([name, value]) => [
    `--atomic-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    value,
  ])
) as CSSProperties
