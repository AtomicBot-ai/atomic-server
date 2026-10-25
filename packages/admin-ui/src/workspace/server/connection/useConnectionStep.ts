import { useEffect, useRef, useState } from 'react'
import type { ConnectionStep } from '@contract'

/** Focus the entered guide step without moving focus during model polling. */
export function useConnectionStep(initial: ConnectionStep) {
  const [step, setStep] = useState<ConnectionStep>(initial)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  return { step, setStep, heading }
}
