import { useEffect, useRef, useState } from 'react'
import { engineFamily, engineName, setupFinished } from '@view'
import { describeError } from '@/services/admin-api'
import { useWorkspace } from '../useWorkspace'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { IntroScreen } from './IntroScreen'
export function EngineIntro({ onContinue, replay = false }: { onContinue: () => void; replay?: boolean }) {
  const w = useWorkspace()
  const [stage, setStage] = useState<'checking' | 'choose' | 'engines' | 'installing' | 'ready'>(
    replay ? 'ready' : 'checking'
  )
  const [engines, setEngines] = useState<RecordValue[]>([])
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState('')
  const { snapshot, execute, refresh } = w
  const checking = useRef(false)
  const completed = useRef(false)
  useEffect(() => {
    if (setupFinished(snapshot?.setup) && !completed.current) {
      completed.current = true
      onContinue()
    }
  }, [snapshot?.setup, stage, onContinue])
  useEffect(() => {
    if (stage !== 'engines') return
    const back = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setStage('choose')
    }
    window.addEventListener('keydown', back, true)
    return () => window.removeEventListener('keydown', back, true)
  }, [stage])
  useEffect(() => {
    if (stage !== 'installing') return
    const timer = setInterval(() => {
      void refresh()
    }, 1000)
    return () => clearInterval(timer)
  }, [stage, refresh])
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
          setEngines(
            rows(record(result).engines).filter(
              (e) =>
                (engineFamily(text(e.engine)) === 'llamacpp' && e.latest) ||
                (e.active && ['llamacpp', 'managed', 'foundry'].includes(engineFamily(text(e.engine))))
            )
          )
          setStage('choose')
        }
      })
      .catch((failure) => {
        setError(describeError(failure))
        setStage('engines')
      })
  }, [snapshot, stage, execute, onContinue])
  const choose = async () => {
    setStage('engines')
    setFinding(true)
    setError('')
    try {
      const result = record(await w.execute('engines.list'))
      const list = rows(result.engines)
      setEngines(
        list.filter(
          (e) =>
            (engineFamily(text(e.engine)) === 'llamacpp' && e.latest) ||
            (e.active && ['llamacpp', 'managed', 'foundry'].includes(engineFamily(text(e.engine))))
        )
      )
    } catch (e) {
      setError(describeError(e))
    } finally {
      setFinding(false)
    }
  }
  if (stage === 'engines')
    return (
      <main className="atomic-intro">
        <section className="atomic-intro-card">
          <h1>Choose your engine</h1>
          <div className="intent-grid">
            {engines.map((e) => (
              <button
                key={text(e.engine)}
                onClick={async () => {
                  setStage('installing')
                  setError('')
                  try {
                    if (e.active) {
                      await w.execute('engines.select', { engine: text(e.engine) })
                      setStage('ready')
                    } else {
                      await w.execute('engines.enqueue', { engine: e.engine, select: true })
                      onContinue()
                    }
                  } catch (failure) {
                    setError(describeError(failure))
                    setStage('engines')
                  }
                }}
              >
                {engineName(text(e.engine))}
                {e.active ? ' · Installed' : ''}
              </button>
            ))}
          </div>
          {!engines.length && !error && (
            <p>{finding ? 'Finding compatible engines…' : 'No compatible engines available.'}</p>
          )}
          {error && (
            <>
              <p role="alert">{error}</p>
              <button onClick={choose}>Retry</button>
            </>
          )}
          <button onClick={onContinue}>Set up later</button>
        </section>
      </main>
    )
  return (
    <IntroScreen
      key={stage}
      onContinue={stage === 'ready' ? onContinue : choose}
      disabled={(stage === 'checking' && !w.error) || stage === 'installing'}
      label={
        stage === 'ready'
          ? 'Press any key'
          : stage === 'checking'
            ? w.error
              ? 'Retry connection'
              : 'Checking setup…'
            : stage === 'installing'
              ? 'Adding download…'
              : 'Choose engine'
      }
    />
  )
}
