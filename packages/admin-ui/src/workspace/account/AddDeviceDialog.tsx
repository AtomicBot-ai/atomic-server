// Lifted from Atomic-Chat/web-app/src/containers/account/remote/AddDeviceDialog.tsx @ e630a461b; adapted: the server's QR SVG as an image, workspace operations, snapshot polling, Copy link, no i18n.
import { useEffect, useId, useRef, useState } from 'react'
import { countdown, deviceLabel } from '@view'
import type { AccountPairingCode } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, Copy } from '../Controls'
import { useDialog } from '../useDialog'
import { useAccountPoll, useNow } from './use-account-poll'

/** The QR code as an image: the SVG comes from the server and never enters the page as markup. */
const qrSource = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

/**
 * "Add a device": a pairing code, its QR code and its link, valid 10 minutes. The device scans or types the
 * code (a desktop pastes the link) and gets its own key; the dialog closes itself once a new device shows up
 * among the devices with access. Closing it unused closes the code too.
 */
export function AddDeviceDialog({
  workspace: w,
  pairing: opened,
  onClose,
  onPaired,
}: {
  workspace: Workspace
  pairing: AccountPairingCode
  onClose: () => void
  onPaired: (device: string) => void
}) {
  const title = useId()
  const [pairing, setPairing] = useState(opened)
  const devices = w.snapshot?.account?.remote.devices
  // The devices there were when this code was opened: any other one paired with it.
  const known = useRef(new Set((devices ?? []).map((device) => device.grant_id)))
  const paired = useRef(false)
  const now = useNow(true)
  const expired = now >= pairing.expires_at
  const fresh = devices?.find((device) => !known.current.has(device.grant_id))
  useAccountPoll(w.refresh, !expired)
  useEffect(() => {
    if (!fresh || paired.current) return
    paired.current = true
    onPaired(deviceLabel(fresh))
  }, [fresh, onPaired])
  const close = () => {
    // An unused code should not stay open on the account.
    if (!paired.current) void w.execute('account.remote.pairing.close').catch(() => undefined)
    onClose()
  }
  const ref = useDialog(close)
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal add-device-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        tabIndex={-1}
      >
        <h2 id={title}>Add a device</h2>
        <p className="add-device-intro">
          In Atomic Chat on your phone or another computer, open Account → Remote models, then scan this code
          or type it. On a computer you can paste the link instead.
        </p>
        {/* A scanner needs dark modules on a light ground in either theme. */}
        <div className={`add-device-qr${expired ? ' expired' : ''}`}>
          <img src={qrSource(pairing.qr_svg)} alt="QR code of the pairing link" width={176} height={176} />
        </div>
        <span className="add-device-or">or type</span>
        <code className="add-device-code" aria-label="Pairing code">
          {pairing.code}
        </code>
        <p className="add-device-timer" role="timer">
          {expired ? 'This code has expired.' : `Expires in ${countdown(pairing.expires_at, now)}`}
        </p>
        <div className="ew-actions">
          <Copy value={pairing.link} label="Copy link" />
          {expired && (
            <Action
              primary
              onClick={async () => {
                known.current = new Set((devices ?? []).map((device) => device.grant_id))
                setPairing(await w.execute<AccountPairingCode>('account.remote.pairing.open'))
              }}
            >
              New code
            </Action>
          )}
          <Action onClick={close}>Cancel</Action>
        </div>
      </section>
    </div>
  )
}
