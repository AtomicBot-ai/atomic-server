# 2026-11-06 — Show engine installation progress in terminal panels

- **Context:** Foundry Local and LiteRT-LM panels kept their Install button visible while a request was pending. Repeated input reached the core's concurrent-install guard; its error could remain after the first request succeeded. Installations queued by intro were also invisible in these panels.
- **Decision:** Show an installation/preparation view with a spinner and task-correlated download bytes, keeping only Close available. Guard actions while busy, track in-flight panel requests by identity and reconnect a reopened panel to its operation. Also observe the server's existing engine jobs, suppress duplicate actions while they run and refresh installed state when they settle. Preserve genuine queued/download failures.
- **Consequences:** The core remains the authority for installation and retains its concurrent-install guard. The TUI does not infer success from downloaded bytes: it waits for installation completion and accelerator preparation. Closing a panel does not stop installation, and stale responses cannot overwrite a different panel.
- **Alternatives:** Removing the core guard would allow concurrent mutations. Showing the guard as an installation failure or clearing every error unconditionally would misrepresent either an ongoing installation or an actual failed download.
- **Owner:** team.
- **Links:** `src/tui/workspace/library/variant-engine-actions.ts`, `src/tui/workspace/library/variant-engine-install.test.ts`, `src/tui/workspace/library/engine-install-progress.ts`.

The web Foundry Local and LiteRT-LM panels use the same task-specific progress selector. In-flight
requests are tracked per workspace executor and engine, so closing and reopening a panel does not
allow another installation. Active server-owned jobs also disable installation, and their completion
refreshes the accelerator view. Preparation remains a separate visible phase; actual install or
preparation failures remain errors. This client state does not replace the core installation lock.
