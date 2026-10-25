---
date: 2026-10-23
title: "Keep pending connections in place"
---

# 2026-10-23 — Keep pending connections in place

- **Context:** Connecting an agent or endpoint lost the selected engine while its model was downloading. Provider dialogs had redundant navigation layers, and secondary skip actions competed with the primary action. The owner requested optional games during downloads.
- **Decision:** Derive the selected engine from the durable download plan until the installed model is available. Keep model, agent and endpoint choices in place through paused, failed, removed and completed downloads. Completion enables configuration but never starts it. Offer classic Minesweeper on web and ASCII Space Invaders in the terminal as explicit, local-only waiting activities. Provider dialogs fit their content; Escape dismisses the current editor or dialog to its origin. Place muted Skip setup immediately before Skip/Continue.
- **Consequences:** Games do not mutate server state or block downloads. Closing a game returns to the same connection draft. Terminal simulation runs only while playing and starts paused when reduced motion is enabled. Readiness and failures stay visible during play. The shared readiness selector covers GGUF, managed and Foundry jobs without duplicating server operations.
- **Failure recovery:** A failed installed-model lookup means availability is unknown, not that the model is missing. Keep the connection draft, block configuration until a successful check, and give Retry keyboard focus on repeated failure or the model field on success. Preserve completed bytes across paused download stages so progress remains consistent with files already present.
- **Alternatives:** Automatically connecting at download completion would surprise the user and could launch an agent unexpectedly. Sending users back to model selection loses context. Mandatory games would obstruct setup.
- **Owner:** team.
- **Links:** `src/workspace-view/connection-model.ts`, `packages/admin-ui/src/workspace/games/`, `src/tui/workspace/waiting-game.ts`, desktop prototype `5043013`.
