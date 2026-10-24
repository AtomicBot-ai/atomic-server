---
date: 2026-10-23
title: "Keep the browser and terminal on one live workspace"
---

# 2026-10-23 — Keep the browser and terminal on one live workspace

- **Context:** Both clients already called the daemon-owned workspace, but their onboarding screens latched local flags. Several provider, model and settings panels only read once. Finishing setup or changing the server in one client could leave the other showing obsolete controls.
- **Decision:** The shared workspace remains the authority for setup completion, the API, loaded services, downloads and keys. Automatic onboarding, including the engine intro, follows that state. A saved manual choice also ends onboarding, including older records whose inference-verification flag remains false. Local panel reads refresh every 2.5 seconds; web panels also refresh when visible again. Terminal configuration reads follow its existing two-second status poll. Read-only operations do not trigger another workspace snapshot, preventing catalog reads from feeding back into snapshot refreshes.
- **Consequences:** Finishing onboarding in either client closes the other client's idle first-run flow. A client actively configuring a connection keeps its result and launch command until Done, and explicitly reopened guides remain open. Current pages, searches, unsaved fields and credentials stay local. Saved engine/model selections follow running services; engine edits retain their original conflict revision until saved or discarded. The existing polling cadence bounds propagation, and background work continues if a screen closes.
- **Alternatives:** Adding a separate UI state store or broadcasting navigation would create another authority and overwrite local work. Adding another event protocol was unnecessary because the existing snapshot and typed operations expose the required state; polling also recovers after missed events and hidden browser tabs.
- **Owner:** team.
- **Links:** `src/tui/workspace/shared-state.ts`, `src/tui/workspace/shared-panels.ts`, `packages/admin-ui/src/workspace/watch-shared-read.ts`, `test/contract/shared-workspace.test.ts`.
