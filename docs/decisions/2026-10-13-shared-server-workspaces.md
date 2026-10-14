# Shared server workspaces and agent controls

Date: 2026-10-13
Status: accepted for local validation

## Context

The terminal had independent setup and model controls, and the web admin exposed only a subset of
Core. Automating a setup required knowing internal routes. Media installations started in a short-lived
client could be interrupted when that client exited.

## Decision

Use one named operation registry with JSON input schemas, effects and descriptions. The daemon owns a
WorkspaceService that dispatches validated operations to Core or existing exported installers. The
TUI, web admin and CLI use that same service through the authenticated loopback admin API. The registry
is browser-safe. Read-only snapshots mask API keys and never contain the Core or admin token.

The terminal has a persistent server cockpit and three workspaces: Playground, Server, Engines & Models.
The web admin follows the same structure. Guided setup, explicit manual setup and agent-led setup share
persisted state; manual entry does not pretend a model is ready. Readiness requires a real task probe.

Navigation labels and order are shared browser-safe constants. Server contains Connect, Traffic,
Runtime and Diagnostics. Engines & Models contains Installed, Catalog, Engines and Downloads.
Playground uses the same task list in both clients. Platform-specific controls keep those same locations.
Both clients use one Downloads selector: successful jobs disappear after verification, while failed or
interrupted jobs remain available for recovery. This only filters the view; installation records and
files remain available to Installed and setup readiness.

Agents can discover operations offline with `atc control list --json`, execute them with `control call`,
and receive snapshots with `control watch`. `atc mcp` exposes the same tools over stdio. MCP defaults to
read-only tools; changes and secret exports require explicit flags. Stdio carries only JSON-RPC.
Downloads use reviewed plans and stable request IDs. Jobs belong to the server, not a browser or terminal.

Unsupported features remain explicit errors from the pinned Core. No upstream engine option becomes an
Atomic capability simply because the upstream project supports it. API binding, model loading and
background server lifetime remain separate actions.

## Consequences

- No new runtime dependencies or cloud service is required.
- A web admin session is a privileged local session; remote browsers should use an authenticated tunnel.
- MCP clients inherit the local user's authority but can be restricted to observation by omitting flags.
- TUI operation forms and the console provide access to advanced parameters without top-level tabs.
- Cross-surface schema and runtime tests are required alongside UI tests.
- This supersedes the four-destination terminal layout and the mandatory-onboarding entry gate.
