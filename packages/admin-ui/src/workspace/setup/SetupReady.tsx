import { SETUP_GOALS } from '@contract'
import { Action, Copy } from '../Controls'
export function SetupReady({
  goal,
  endpoint,
  onOpenGoal,
}: {
  goal: string
  endpoint: string
  onOpenGoal: (goal: string) => void
}) {
  const selected = SETUP_GOALS.find((item) => item.id === goal) ?? SETUP_GOALS[0]
  return (
    <>
      <div className="ready-card">
        <strong>Model verified · API online</strong>
        <code>{endpoint}</code>
        <Copy value={endpoint} label="Copy address" />
      </div>
      <p className="setup-guidance">{selected.next}</p>
      <Action primary onClick={() => onOpenGoal(goal)}>
        {selected.destination === 'server' ? 'Connect an app or agent' : `Open ${selected.label}`}
      </Action>
    </>
  )
}
