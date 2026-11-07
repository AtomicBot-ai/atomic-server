import { useEffect, useRef, useState } from 'react'
import { setupFinished } from '@view'
import { useWorkspace } from '../useWorkspace'
import { record, rows } from '../types'
import { IntroScreen } from './IntroScreen'
import { EngineChooser } from './EngineChooser'

export function EngineIntro({ onContinue }: { onContinue: () => void }) {
  const w = useWorkspace()
  const [stage, setStage] = useState<'checking' | 'choose' | 'engines' | 'ready'>('checking')
  const { snapshot, execute } = w
  const checking = useRef(false)
  const completed = useRef(false)
  useEffect(() => {
    if (setupFinished(snapshot?.setup) && !completed.current) {
      completed.current = true
      onContinue()
    }
  }, [snapshot?.setup, stage, onContinue])
  useEffect(() => {
    if (!snapshot || stage !== 'checking' || checking.current) return
    checking.current = true
    if (setupFinished(snapshot.setup)) return
    if (snapshot.setups.length > 0 || snapshot.downloads.some((row) => record(row).kind === 'engine')) {
      onContinue()
      return
    }
    void execute('engines.list')
      .then((result) => {
        if (completed.current) return
        if (rows(record(result).engines).some((e) => e.active)) setStage('ready')
        else {
          setStage('choose')
        }
      })
      .catch(() => setStage('engines'))
  }, [snapshot, stage, execute, onContinue])
  if (stage === 'engines')
    return (
      <EngineChooser
        workspace={w}
        onContinue={onContinue}
        onBack={() => setStage('choose')}
        onLater={onContinue}
      />
    )
  return (
    <IntroScreen
      key={stage}
      onContinue={stage === 'ready' ? onContinue : () => setStage('engines')}
      disabled={stage === 'checking' && !w.error}
      label={
        stage === 'ready'
          ? 'Press any key'
          : stage === 'checking'
            ? w.error
              ? 'Retry connection'
              : 'Checking setup…'
            : 'Choose engine'
      }
    />
  )
}
