# Adapt llama.cpp web workflows across Atomic engines

Status: accepted for the local candidate; focused manual regression complete, broad coverage pending.

The user requested adaptation of missing llama.cpp panel features and useful processes.
Atomic remains a server for external agents, with engine selection before model selection.
The Playground is an optional diagnostic client, not the default setup destination.

## Decision

- Use the existing authenticated workspace-operation boundary for streaming jobs, progress,
  cancellation and conversation import. The server owns the upstream OpenAI stream; browsers
  read accumulated progress every 250 ms. Abort cancels the actual HTTP request to Core, whose
  public proxy tears down the upstream connection. Engine cancellation behavior still needs
  verification for each provider.
- Preserve partial responses and metadata in existing profile history. A 60-second observation
  lease and ten-minute upper bound prevent abandoned Playground jobs from running indefinitely.
  Completed jobs are bounded in memory; durable history remains available after expiry/restart.
- Keep engine/model identities visible. Refuse ambiguous same-model IDs across engines because
  the public model route cannot promise the selected instance in that situation.
- Conversation editing and regeneration create branches. Archive is reversible. Imports validate
  the batch before writing and assign new IDs, keeping original conversations intact.
- Keep request presets and display preferences in browser storage; keep engine configuration in
  Core's settings store. Persist request overrides with each conversation. Importing engine configuration stages changes and requires matching
  engine IDs, supported keys, revision-aware save and a separate deliberate model reload.
- Group descriptors for presentation without copying provider validation or changing defaults.
  Search covers every group; a changed-fields review remains available. Engine-specific advanced
  fields are never applied by merely changing the selected engine.
- Render basic Markdown as inert React elements. Do not execute raw HTML, scripts or embedded
  web content. Tool calls can be inspected, denied or supplied with a manual result; the browser
  time example requires an explicit click. Existing external-agent connections remain the path
  for MCP and autonomous tools.
- No new dependency or Core modification is introduced. PDF conversion, rich equation rendering,
  browser speech recognition and a second autonomous MCP client are not simulated by UI controls.
  Record such parity gaps explicitly in the delivery inventory.

## Validation

The user's testing restriction takes precedence over automated test instructions: only native
mouse/keyboard UI tests and documented server CLI commands. Compile the UI/server and embedded
binary, then verify generation, cancellation, recovery, branching, transfer, preferences and
engine-settings flows manually. A successful build does not establish functional coverage.

Observed on macOS arm64 with upstream llama.cpp b11463 and LFM2.5-1.2B: streaming,
cancellation, follow-up, page-refresh recovery, branch editing/regeneration, archive/restore,
JSON conversation transfer, explicit tool result approval, preset application, per-conversation
parameters, text attachment inference, settings save/readback/restoration, deliberate reload,
engine-preset round-trip and cross-engine rejection. Other engines and failure/capacity cases
remain open. The delivery report records evidence per candidate build; this is not release sign-off.

PDF/full Markdown/math dependencies were proposed to the owner under rule 10 and remain
unapproved. None was added; the dependency-free renderer's limitations remain explicit.

## Consequences

The UI stays runtime-neutral and fits both nontechnical agent users and technical operators.
Polling adds bounded local HTTP traffic; it avoids a second authentication/transport path and
supports the existing command client. The browser does not receive a server key. Tool execution
and native-engine feature support remain explicit rather than being inferred from model names.
