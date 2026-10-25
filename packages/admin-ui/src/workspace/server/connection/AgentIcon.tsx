// Lifted from Atomic-Chat/web-app/src/containers/AgentIcon.tsx @ 1c01e2a; adapted: bundled static marks and server agent IDs.
const MARKS: Record<string, { asset: string; color: string }> = {
  'claude': {
    asset: 'claude.svg',
    color: '#1f1e1d',
  },
  'codex': {
    asset: 'codex.png',
    color: '#ffffff',
  },
  'opencode': {
    asset: 'opencode.svg',
    color: '#1a1717',
  },
  'openclaude': {
    asset: 'openclaude.png',
    color: '#000000',
  },
  'zcode': {
    asset: 'zcode.png',
    color: '#0b0c0c',
  },
  'zed': {
    asset: 'zed.svg',
    color: '#0c0d0e',
  },
  'muse': {
    asset: 'muse.svg',
    color: '#ffffff',
  },
  'mimo': {
    asset: '',
    color: '#ff6700',
  },
  'copilot': {
    asset: 'copilot.svg',
    color: '#000000',
  },
  'droid': {
    asset: 'droid.svg',
    color: '#020202',
  },
  'pi': {
    asset: 'pi.svg',
    color: '#09090b',
  },
  'goose': {
    asset: 'goose.svg',
    color: '#ffffff',
  },
  'openhands': {
    asset: 'openhands.svg',
    color: '#ffffff',
  },
  'poolside': {
    asset: 'poolside.svg',
    color: '#ffffff',
  },
  'kilo': {
    asset: 'kilo.svg',
    color: '#ffffff',
  },
  'openclaw': {
    asset: 'openclaw.png',
    color: '#ffffff',
  },
  'atomic-agent': {
    asset: 'atomic-agent.svg',
    color: '#006aff',
  },
  'hermes': {
    asset: 'hermes.png',
    color: '#ffffff',
  },
  'cline': {
    asset: 'cline.png',
    color: '#2b303b',
  },
  'dsh': {
    asset: 'dsh.svg',
    color: '#4d6bfe',
  },
  'vscode': {
    asset: 'vscode.svg',
    color: '#0065a9',
  },
  'jetbrains': {
    asset: 'jetbrains.png',
    color: 'transparent',
  },
  'xcode': {
    asset: 'xcode.png',
    color: 'transparent',
  },
}
export function AgentIcon({ id, label }: { id: string; label: string }) {
  const icon = MARKS[id]
  return (
    <span className="connection-agent-icon" style={{ backgroundColor: icon?.color }} aria-hidden="true">
      {icon?.asset ? <img src={`/images/agents/${icon.asset}`} alt="" /> : label[0]}
    </span>
  )
}
