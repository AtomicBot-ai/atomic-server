import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { AtomicMark } from '../AtomicMark'
import './intro.css'

export function IntroScreen({
  onContinue,
  label = 'Press any key',
  disabled = false,
  children,
}: {
  onContinue: () => void
  label?: string
  disabled?: boolean
  children?: ReactNode
}) {
  const button = useRef<HTMLButtonElement>(null)
  const continued = useRef(false)
  const enter = () => {
    if (disabled || continued.current) return
    continued.current = true
    onContinue()
  }
  useEffect(() => {
    button.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.isComposing || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!continued.current) {
        continued.current = true
        onContinue()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onContinue, disabled])
  return (
    <main className="atomic-intro" aria-label="Atomic Server intro">
      <div className="atomic-intro-card">
        <AtomicMark className="atomic-intro-mark" />
        <h1>Atomic Server</h1>
        <div className="atomic-intro-action">
          {children}
          <button ref={button} type="button" disabled={disabled} onClick={enter}>
            {label}{' '}
            <span className="intro-cursor" aria-hidden="true">
              _
            </span>
          </button>
        </div>
      </div>
    </main>
  )
}
