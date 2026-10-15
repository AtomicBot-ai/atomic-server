import { useEffect, useState } from 'react'

import { SignIn } from '@/containers/SignIn'
import { useAdminStatus } from '@/hooks/useAdminStatus'
import { useServiceHub } from '@/hooks/useServiceHub'
import type { BootstrapResult } from '@/services/session'
import { useStatusStore } from '@/stores/status-store'
import { WorkspaceApp } from '@/workspace'

/** Signs in with the `#token=` fragment, then shows the workspace; a 401 is the sign-in screen. */
export function AdminRoot() {
  const hub = useServiceHub()
  const { status, unauthorized } = useAdminStatus()
  const [boot, setBoot] = useState<BootstrapResult | null>(null)

  // Trade the `#token=` fragment for a session (once), then ask for the first status. A 401 there
  // is the sign-in screen; anything else is the workspace, with the error on the dashboard.
  useEffect(() => {
    let active = true
    void hub
      .session()
      .bootstrap()
      .then(async (result) => {
        await useStatusStore.getState().refresh()
        if (active) setBoot(result)
      })
    return () => {
      active = false
    }
  }, [hub])

  if (boot === null && !status) return <Splash />
  if (unauthorized && !status) return <SignIn refused={boot === 'refused'} />
  return <WorkspaceApp />
}

function Splash() {
  return (
    <div className="flex h-svh items-center justify-center bg-background text-sm text-muted-foreground">
      Connecting to atc…
    </div>
  )
}
