import { useRef, useState, type ReactNode } from 'react'
import { ActionConfirmation } from './ActionConfirmation'

type Confirmation = {
  title: string
  actionLabel: string
  children?: ReactNode
  danger?: boolean
  onConfirm: () => Promise<unknown>
}

/** Capture one exact operation while its confirmation is open, including during retries. */
export function useConfirmation() {
  const current = useRef<Confirmation | null>(null)
  const [request, setRequest] = useState<Confirmation | null>(null)
  const ask = (next: Confirmation) => {
    if (current.current) return
    current.current = next
    setRequest(next)
  }
  const close = () => {
    current.current = null
    setRequest(null)
  }
  return {
    ask,
    waiting: Boolean(request),
    confirmation: request ? <ActionConfirmation {...request} onClose={close} /> : null,
  }
}
