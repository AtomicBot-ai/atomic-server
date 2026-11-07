import { KeyRound } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SettingsField } from '@/workspace/SettingsField'
import './sign-in.css'
import { useServiceHub } from '@/hooks/useServiceHub'
import { describeError } from '@/services/admin-api'
import { useStatusStore } from '@/stores/status-store'

interface SignInProps {
  /** The `#token=` in the URL was refused: say so instead of a blank form. */
  refused?: boolean
}

export function SignIn({ refused = false }: SignInProps) {
  const hub = useServiceHub()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(
    refused ? 'The token in the link was refused. Run `atc admin` again for a fresh one.' : null
  )

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = token.trim()
    if (!value) return
    setBusy(true)
    setError(null)
    try {
      await hub.session().login(value)
      await useStatusStore.getState().refresh()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-surface admin-sign-in">
      <Card className="admin-sign-in-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-5" aria-hidden />
            Sign in to atc admin
          </CardTitle>
          <CardDescription>This browser has no session with the server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              On the server, run <code className="rounded bg-muted px-1.5 py-0.5">atc admin</code>.
            </li>
            <li>Open the link it prints. It carries a one-time token that signs this browser in.</li>
          </ol>
          <form onSubmit={submit} className="settings-form" aria-busy={busy || undefined}>
            <SettingsField label="Or paste the token here" layout="stacked" error={error ?? undefined}>
              <input
                id="admin-token"
                name="token"
                autoComplete="off"
                spellCheck={false}
                placeholder="admin token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                disabled={busy}
              />
            </SettingsField>
            <div className="admin-sign-in-actions">
              <Button type="submit" disabled={busy || !token.trim()}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
