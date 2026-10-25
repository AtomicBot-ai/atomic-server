// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: actual browser permissions.
import { useEffect, useState } from 'react'
import { Bell, Mic, Check, ShieldCheck } from 'lucide-react'
import { Action } from '../Controls'
import { useDialog } from '../useDialog'
import { describeError } from '@/services/admin-api'

const permissions = [
  {
    id: 'notifications',
    title: 'Notifications',
    Icon: Bell,
    reason: 'Know when a model is ready or a long task finishes.',
    detail: 'Allow this browser to show download and task notifications.',
  },
  {
    id: 'microphone',
    title: 'Microphone',
    Icon: Mic,
    reason: 'Speak your prompts and use voice conversations.',
    detail: 'Microphone access is used only when you start recording. Text chat works without it.',
  },
] as const
export function Permissions({ onGranted }: { onGranted: (granted: boolean) => void }) {
  const [allowed, setAllowed] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<(typeof permissions)[number] | null>(null)
  useEffect(() => {
    let live = true
    const check = async () => {
      const values: Record<string, boolean> = {
        notifications: typeof Notification !== 'undefined' && Notification.permission === 'granted',
      }
      try {
        values.microphone =
          (await navigator.permissions.query({ name: 'microphone' as PermissionName })).state === 'granted'
      } catch {
        /* Browser does not expose permission queries. */
      }
      if (live) {
        setAllowed(values)
        onGranted(Object.values(values).some(Boolean))
      }
    }
    void check()
    return () => {
      live = false
    }
  }, [onGranted])
  return (
    <>
      <p>Choose what you want to enable. Everything here is optional.</p>
      <div className="first-permissions">
        {permissions.map((p) => (
          <article key={p.id}>
            <p.Icon size={23} />
            <div>
              <h2>{p.title}</h2>
              <p>{p.reason}</p>
            </div>
            <Action onClick={() => setSelected(p)}>
              {allowed[p.id] ? (
                <>
                  <Check size={14} /> Allowed
                </>
              ) : (
                'Allow'
              )}
            </Action>
          </article>
        ))}
      </div>
      {selected && (
        <PermissionDialog
          item={selected}
          close={() => setSelected(null)}
          granted={() => {
            setAllowed((v) => ({ ...v, [selected.id]: true }))
            onGranted(true)
            setSelected(null)
          }}
        />
      )}
    </>
  )
}
function PermissionDialog({
  item,
  close,
  granted,
}: {
  item: (typeof permissions)[number]
  close: () => void
  granted: () => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const ref = useDialog(() => {
    if (!busy) close()
  })
  const request = async () => {
    setBusy(true)
    setError('')
    try {
      if (item.id === 'notifications') {
        if (typeof Notification === 'undefined')
          throw new Error('Notifications are unavailable in this browser.')
        if ((await Notification.requestPermission()) !== 'granted')
          throw new Error(
            'Notifications were not allowed. Change the site permission in your browser to retry.'
          )
      } else {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('Microphone access is unavailable in this browser.')
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      }
      granted()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="wizard-overlay">
      <section
        ref={ref}
        tabIndex={-1}
        className="wizard first-permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Allow ${item.title.toLowerCase()}?`}
      >
        <item.Icon size={30} />
        <h2>Allow {item.title.toLowerCase()}?</h2>
        <p>{item.detail}</p>
        {error && (
          <p role="alert" className="ew-error">
            {error}
          </p>
        )}
        <div className="ew-actions">
          <Action disabled={busy} onClick={close}>
            Not now
          </Action>
          <Action primary disabled={busy} onClick={request}>
            {busy ? 'Waiting for browser…' : 'Allow access'}
          </Action>
        </div>
      </section>
    </div>
  )
}
export function PermissionsWarning({
  close,
  proceed,
}: {
  close: () => void
  proceed: () => void | Promise<void>
}) {
  const ref = useDialog(close)
  return (
    <div className="wizard-overlay">
      <section
        ref={ref}
        tabIndex={-1}
        className="wizard first-permission-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Continue without permissions?"
      >
        <ShieldCheck size={30} />
        <h2>Continue without permissions?</h2>
        <p>
          Voice input and download notifications may be unavailable. You can enable access later in your
          browser settings.
        </p>
        <div className="ew-actions">
          <Action onClick={close}>Review permissions</Action>
          <Action primary onClick={proceed}>
            Continue without permissions
          </Action>
        </div>
      </section>
    </div>
  )
}
