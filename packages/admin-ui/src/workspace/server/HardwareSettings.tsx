// Lifted from Atomic-Chat/web-app/src/routes/settings/hardware.tsx @ 5043013; adapted: real read-only core hardware facts.
import { useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'

const memory = (value: unknown) =>
  typeof value === 'number' && value > 0 ? `${(value / 1024).toFixed(1)} GiB` : 'Not reported'
function Facts({ title, facts }: { title: string; facts: [string, unknown][] }) {
  return (
    <section className="settings-card">
      <h2 className="settings-card-heading">{title}</h2>
      {facts.map(([label, value]) => (
        <div className="settings-item" key={label}>
          <strong>{label}</strong>
          <span className="settings-value">{text(value, 'Not reported')}</span>
        </div>
      ))}
    </section>
  )
}
export function HardwareSettings({ workspace: { execute } }: { workspace: Workspace }) {
  const [hardware, setHardware] = useState<RecordValue | null>(null)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let live = true
    setError('')
    void execute('hardware.info')
      .then((value) => {
        if (live) setHardware(record(value))
      })
      .catch((e) => {
        if (live) setError(describeError(e))
      })
    return () => {
      live = false
    }
  }, [execute, revision])
  if (error)
    return (
      <div className="ew-error" role="alert">
        {error}
        <Action onClick={() => setRevision((n) => n + 1)}>Retry</Action>
      </div>
    )
  if (!hardware) return <p role="status">Reading hardware…</p>
  const info = record(hardware.info),
    cpu = record(info.cpu)
  return (
    <>
      <Facts
        title="Operating system"
        facts={[
          ['Name', info.os_type],
          ['Version', info.os_name],
        ]}
      />
      <Facts
        title="CPU"
        facts={[
          ['Model', cpu.name],
          ['Architecture', cpu.arch],
          ['Cores', cpu.core_count],
        ]}
      />
      <Facts title="Memory" facts={[['Total', memory(info.total_memory)]]} />
      {rows(info.gpus).map((gpu, index) => (
        <Facts
          key={text(gpu.uuid, String(index))}
          title={text(gpu.name, 'GPU')}
          facts={[
            ['Vendor', gpu.vendor],
            ['Memory', memory(gpu.total_memory)],
            ['Driver', gpu.driver_version],
          ]}
        />
      ))}
      {Array.isArray(hardware.warnings) &&
        hardware.warnings.map((warning) => (
          <p role="status" key={String(warning)}>
            {String(warning)}
          </p>
        ))}
    </>
  )
}
