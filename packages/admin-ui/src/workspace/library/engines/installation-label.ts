export interface EngineInstallation {
  taskId: string
  stage: 'installing' | 'preparing'
  phase?: string
}
export function installationLabel(installation: EngineInstallation | null) {
  if (!installation) return ''
  if (installation.stage === 'preparing') return 'Preparing accelerators…'
  return (
    (
      {
        queued: 'Queued…',
        connecting: 'Connecting…',
        downloading: 'Downloading engine…',
        verifying: 'Verifying download…',
        extracting: 'Unpacking engine…',
        installing: 'Installing engine…',
      } as Record<string, string>
    )[installation.phase ?? 'installing'] ?? 'Installing engine…'
  )
}
