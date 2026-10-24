/** Navigation names and order shared by the terminal and browser workspaces. */
export const WORKSPACE_NAVIGATION = [
  { id: 'server', label: 'Server' },
  { id: 'catalog', label: 'Models' },
  { id: 'settings', label: 'Settings' },
  { id: 'playground', label: 'Playground' },
] as const

export const SERVER_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'connect', label: 'Connections' },
  { id: 'traffic', label: 'Activity' },
  { id: 'model', label: 'Engine & model' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'remote', label: 'Remote access' },
  { id: 'proxy', label: 'HTTPS proxy' },
  { id: 'keys', label: 'API keys' },
] as const

/** Desktop sidebar entries; other server views are reached from their owning page. */
export const SERVER_NAVIGATION = [
  { id: 'overview', label: 'Overview' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'remote', label: 'Remote access' },
  { id: 'proxy', label: 'HTTPS proxy' },
] as const

export const SETTINGS_SECTIONS = [
  { id: 'admin', label: 'General' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'tui', label: 'Interface' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
  { id: 'hardware', label: 'Hardware' },
] as const

export const SETTINGS_WORKSPACE_SECTIONS = [
  { id: 'assistants', label: 'Assistants' },
  { id: 'connectors', label: 'MCP connectors' },
  { id: 'skills', label: 'Skills' },
] as const

/** Server configuration remains available inside General, without adding sidebar screens. */
export const SERVER_SETTINGS_GROUPS = [
  { id: 'api', label: 'Network & API' },
  { id: 'engines', label: 'Runtime' },
  { id: 'models', label: 'Startup models' },
  { id: 'managed', label: 'Containers' },
  { id: 'update', label: 'Updates' },
  { id: 'log', label: 'Logging' },
  { id: 'proxy', label: 'Proxy' },
  { id: 'telemetry', label: 'Privacy' },
  { id: 'diagnostics', label: 'Diagnostics' },
] as const

export const LIBRARY_SECTIONS = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'catalog', label: 'Local models' },
  { id: 'cloud', label: 'Cloud providers' },
  { id: 'endpoint', label: 'Custom Endpoint' },
  { id: 'engines', label: 'Inference engines' },
] as const

export const PLAYGROUND_TASKS = [
  { id: 'chat', label: 'Chat' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
] as const

/** Human labels; stable dotted paths remain the configuration wire format. */
export const SETTING_LABELS: Readonly<Record<string, string>> = {
  'api.host': 'Listen address',
  'api.port': 'API port',
  'api.prefix': 'URL prefix',
  'api.trustedHosts': 'Additional allowed hosts',
  'api.autoStart': 'Start API automatically',
  'admin.host': 'Admin listen address',
  'admin.port': 'Admin port',
  'admin.openOnStart': 'Open browser on start',
  'admin.autoStart': 'Start web admin automatically',
  'engines.autoInstall': 'Install recommended engine on start',
  'engines.default': 'Default engine',
  'models.autoLoad': 'Models to load on start',
  'managed.mode': 'Container runtime',
  'managed.image': 'Container image override',
  'proxy.url': 'Proxy address',
  'proxy.noProxy': 'Bypass proxy for these hosts',
  'proxy.ignoreSsl': 'Skip proxy certificate verification',
  'update.channel': 'Release channel',
  'update.checkOnStart': 'Check for updates on start',
  'telemetry.enabled': 'Send error reports',
  'tui.endpoint': 'Playground endpoint',
  'tui.model': 'Last Playground model',
  'tui.motion': 'Animate the server eye',
  'tui.mouse': 'Enable terminal mouse navigation',
  'log.level': 'Log detail',
  'log.maxFiles': 'Log files to keep',
  'log.maxSizeMb': 'Maximum log file size (MB)',
}
