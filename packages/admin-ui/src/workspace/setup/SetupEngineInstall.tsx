import { useState } from 'react'
import { engineName } from '@view'
import { Action } from '../Controls'
import { EngineSetup } from '../library/engines/EngineSetup'
import { FoundryLocal } from '../library/engines/FoundryLocal'
import { LiteRtLm } from '../library/engines/LiteRtLm'
import type { Workspace } from '../useWorkspace'

/**
 * A managed engine, Foundry Local or LiteRT-LM chosen in setup but not installed here: its installation inside
 * the wizard, through the same modal as the Engines tab; closing it reads the engines again.
 */
export function SetupEngineInstall({
  workspace: w,
  engine,
  onDone,
}: {
  workspace: Workspace
  engine: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const close = () => {
    setOpen(false)
    onDone()
  }
  return (
    <div className="setup-guidance">
      <p>{engineName(engine)} is not installed here yet: install it, then choose its model.</p>
      <Action primary onClick={() => setOpen(true)}>
        Install {engineName(engine)}
      </Action>
      {open &&
        (engine === 'foundry-local' ? (
          <FoundryLocal workspace={w} onClose={close} />
        ) : engine === 'litert-lm' ? (
          <LiteRtLm workspace={w} onClose={close} />
        ) : (
          <EngineSetup workspace={w} engine={engine} onClose={close} />
        ))}
    </div>
  )
}
