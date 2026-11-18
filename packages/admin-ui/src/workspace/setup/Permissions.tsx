// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: actual browser permissions.
import { useState } from 'react'
import { Bell } from 'lucide-react'
import { describeError } from '@/services/admin-api'
import { Action } from '../Controls'
import { StatusIndicator } from '../StatusIndicator'
import './onboarding-model.css'

export function Permissions() {
  const supported = typeof Notification !== 'undefined'
  const [allowed, setAllowed] = useState(() => supported && Notification.permission === 'granted')
  const [error, setError] = useState('')

  const request = async () => {
    setError('')
    if (typeof Notification === 'undefined') {
      setError('Notifications are unavailable in this browser.')
      return
    }
    try {
      if ((await Notification.requestPermission()) === 'granted') setAllowed(true)
      else setError('Notifications were not allowed. You can change this in your browser settings.')
    } catch (e) {
      setError(describeError(e))
    }
  }

  return (
    <div className="first-permissions">
      <article className="settings-card">
        <Bell size={23} aria-hidden="true" />
        <div>
          <h2>Notifications</h2>
          <p>{supported ? 'Optional browser permission.' : 'Unavailable in this browser.'}</p>
        </div>
        {allowed ? (
          <span role="status">
            <StatusIndicator tone="positive">Allowed</StatusIndicator>
          </span>
        ) : supported ? (
          <Action onClick={request}>Allow notifications</Action>
        ) : null}
      </article>
      {error && (
        <p role="alert" className="ew-error">
          {error}
        </p>
      )}
    </div>
  )
}
