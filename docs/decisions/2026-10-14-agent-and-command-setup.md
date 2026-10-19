# Agent and command setup

Status: accepted for the local candidate, 2026-10-14.

## Context

The owner clarified two audiences: nontechnical customers use this server to power another agent; technical customers configure and operate it with commands. Both must choose an engine before a model. Advanced details must remain available initially and afterward without dominating the default screen.

## Decision

The default browser path is Power my agent, ending at Server → Connect. Configure with commands exposes profile-specific CLI discovery and exact plan-bound model installation commands. Additional details reuse the real server configuration and engine settings forms, with all typed operations available for less common options. The same additional-details component remains on Server after setup. Model/engine tuning stays collapsed until requested. Engine settings dialogs trap focus and return to the enclosing wizard.

Engine discovery comes from engines.list. The model stage is inaccessible until the user explicitly selects an offered engine. MLX and GGUF catalogs are separated by format; exact GGUF compatibility remains Core's responsibility at file review. A mismatch disables installation and its generated commands instead of changing the selected provider. Standard GGUF plans may run on the explicitly selected TurboQuant provider. Media plans retain their required engine. Managed runtimes remain available through the advanced environment operations.

config.get now includes a shell-quoted command_prefix derived from the same injected executable and profile paths as connection.profile; it contains no client credential. Advanced operation forms can copy the current inputs as a command. Saving configuration during technical setup selects the saved listener configuration for verification. Settings retain their existing apply/reload semantics.

The shared default goal now leads to agent connection in the TUI too. Installing another model no longer skips the TUI engine chooser, and a Prism file cannot silently replace a non-Prism provider.

## Verification and limits

Functional verification uses native Safari mouse/keyboard actions and documented server CLI commands only, per the owner. No automated suites or simulated terminal tests ran. Builds/typechecks are compilation checks. Actual third-party agent tasks and interactive TUI require separate coverage; Computer Use prohibits terminal apps. Non-text inference and other hardware/platforms remain unverified.

The model plan does not accept an arbitrary engine override. We therefore preserve Core planning, check its provider against the explicit choice, and use the selected compatible provider for loading. Missing engine downloads can be additional to model-plan bytes and are disclosed. Engine/file compatibility is not inferred from model names. Resuming an existing job uses that job's recorded engine; it is a separate recovery action from creating a new setup.
